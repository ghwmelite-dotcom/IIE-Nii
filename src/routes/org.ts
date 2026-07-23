import { Hono } from "hono";
import { z } from "zod";
import { apiKeyAuth } from "../lib/auth";

const app = new Hono<{ Bindings: Env }>();

const importSchema = z.object({
	departments: z
		.array(
			z.object({
				department_id: z.string().min(1),
				name: z.string().min(1),
				head_employee_id: z.string().optional(),
			}),
		)
		.default([]),
	employees: z
		.array(
			z.object({
				employee_id: z.string().min(1),
				name: z.string().min(1),
				department_id: z.string().min(1),
				role: z.string().min(1),
				email: z.string().optional(),
				card_id: z.string().optional(),
			}),
		)
		.default([]),
});

const UPSERT_CHUNK = 50;

// Bulk upsert of the org directory (HR system export, or the seed script).
app.post("/import", apiKeyAuth, async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = importSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid org import", issues: parsed.error.issues }, 400);
	}

	const { departments, employees } = parsed.data;
	const statements: D1PreparedStatement[] = [];

	for (const d of departments) {
		statements.push(
			c.env.DB.prepare(
				`INSERT INTO departments (department_id, name, head_employee_id) VALUES (?, ?, ?)
				 ON CONFLICT (department_id) DO UPDATE SET name = excluded.name, head_employee_id = excluded.head_employee_id`,
			).bind(d.department_id, d.name, d.head_employee_id ?? null),
		);
	}
	for (const e of employees) {
		statements.push(
			c.env.DB.prepare(
				`INSERT INTO employees (employee_id, name, department_id, role, email, card_id) VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT (employee_id) DO UPDATE SET
				   name = excluded.name, department_id = excluded.department_id, role = excluded.role,
				   email = excluded.email, card_id = excluded.card_id`,
			).bind(e.employee_id, e.name, e.department_id, e.role, e.email ?? null, e.card_id ?? null),
		);
	}

	for (let i = 0; i < statements.length; i += UPSERT_CHUNK) {
		await c.env.DB.batch(statements.slice(i, i + UPSERT_CHUNK));
	}

	console.log(JSON.stringify({ message: "org imported", departments: departments.length, employees: employees.length }));
	return c.json({ departments: departments.length, employees: employees.length }, 201);
});

export default app;
