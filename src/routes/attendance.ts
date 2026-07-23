import { Hono } from "hono";
import { z } from "zod";
import { insertEvents, toStoredEvent } from "../lib/events";

const app = new Hono<{ Bindings: Env }>();

// OHCS work hours. Accra is UTC year-round (no DST), so UTC dates/times are local.
const LATE_AFTER_HHMM = 8 * 60 + 30; // 08:30

const clockSchema = z
	.object({
		card_id: z.string().min(1).optional(),
		employee_id: z.string().min(1).optional(),
		timestamp: z.iso.datetime({ offset: true }).optional(),
	})
	.refine((d) => d.card_id || d.employee_id, { message: "card_id or employee_id is required" });

interface EmployeeRow {
	employee_id: string;
	name: string;
	department_id: string;
	role: string;
	email: string | null;
	card_id: string | null;
}

interface AttendanceRow {
	record_id: string;
	employee_id: string;
	date: string;
	clock_in: string | null;
	clock_out: string | null;
	status: string;
}

async function findEmployee(db: D1Database, input: { card_id?: string; employee_id?: string }) {
	if (input.employee_id) {
		return db.prepare("SELECT * FROM employees WHERE employee_id = ?").bind(input.employee_id).first<EmployeeRow>();
	}
	return db.prepare("SELECT * FROM employees WHERE card_id = ?").bind(input.card_id!).first<EmployeeRow>();
}

// RFID reader webhook: employee taps in (PRD §5.2).
app.post("/clock-in", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = clockSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid clock-in", issues: parsed.error.issues }, 400);
	}

	const employee = await findEmployee(c.env.DB, parsed.data);
	if (!employee) {
		return c.json({ error: "Unknown employee" }, 404);
	}

	const ts = parsed.data.timestamp ?? new Date().toISOString();
	const date = ts.slice(0, 10);
	const existing = await c.env.DB.prepare("SELECT record_id FROM attendance_records WHERE employee_id = ? AND date = ?")
		.bind(employee.employee_id, date)
		.first();
	if (existing) {
		return c.json({ error: "Already clocked in today", record_id: existing.record_id }, 409);
	}

	const d = new Date(ts);
	const late = d.getUTCHours() * 60 + d.getUTCMinutes() > LATE_AFTER_HHMM;
	const recordId = crypto.randomUUID();
	const status = late ? "late" : "present";

	await insertEvents(c.env.DB, [
		toStoredEvent({
			case_id: `att-${employee.employee_id}-${date}`,
			activity: "clock_in",
			resource: employee.employee_id,
			timestamp: ts,
			source_system: "ATTENDANCE",
			metadata: { department: employee.department_id, late },
		}),
	]);
	await c.env.DB.prepare(
		"INSERT INTO attendance_records (record_id, employee_id, date, clock_in, status) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(recordId, employee.employee_id, date, ts, status)
		.run();

	return c.json({ record_id: recordId, employee_id: employee.employee_id, date, clock_in: ts, status }, 201);
});

// RFID reader webhook: employee taps out.
app.post("/clock-out", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = clockSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid clock-out", issues: parsed.error.issues }, 400);
	}

	const employee = await findEmployee(c.env.DB, parsed.data);
	if (!employee) {
		return c.json({ error: "Unknown employee" }, 404);
	}

	const ts = parsed.data.timestamp ?? new Date().toISOString();
	const date = ts.slice(0, 10);
	const record = await c.env.DB.prepare("SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?")
		.bind(employee.employee_id, date)
		.first<AttendanceRow>();
	if (!record) {
		return c.json({ error: "No clock-in found for today" }, 404);
	}
	if (record.clock_out) {
		return c.json({ error: "Already clocked out today", record_id: record.record_id }, 409);
	}

	await c.env.DB.prepare("UPDATE attendance_records SET clock_out = ? WHERE record_id = ?").bind(ts, record.record_id).run();
	await insertEvents(c.env.DB, [
		toStoredEvent({
			case_id: `att-${employee.employee_id}-${date}`,
			activity: "clock_out",
			resource: employee.employee_id,
			timestamp: ts,
			source_system: "ATTENDANCE",
			metadata: { department: employee.department_id },
		}),
	]);

	return c.json({ record_id: record.record_id, employee_id: employee.employee_id, date, clock_out: ts });
});

// Attendance summary for an employee (PRD §10).
app.get("/:employee_id/summary", async (c) => {
	const employeeId = c.req.param("employee_id");
	const employee = await c.env.DB.prepare("SELECT employee_id, name, department_id FROM employees WHERE employee_id = ?")
		.bind(employeeId)
		.first<Pick<EmployeeRow, "employee_id" | "name" | "department_id">>();
	if (!employee) {
		return c.json({ error: "Unknown employee" }, 404);
	}

	const today = new Date().toISOString().slice(0, 10);
	const totals = await c.env.DB.prepare(
		`SELECT COUNT(*) AS total_days,
		        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_days,
		        SUM(CASE WHEN clock_out IS NULL AND date < ? THEN 1 ELSE 0 END) AS missing_clockouts
		 FROM attendance_records WHERE employee_id = ?`,
	)
		.bind(today, employeeId)
		.first<{ total_days: number; late_days: number | null; missing_clockouts: number | null }>();

	const { results: recent } = await c.env.DB.prepare(
		"SELECT * FROM attendance_records WHERE employee_id = ? ORDER BY date DESC LIMIT 30",
	)
		.bind(employeeId)
		.all<AttendanceRow>();

	return c.json({
		employee_id: employeeId,
		name: employee.name,
		department_id: employee.department_id,
		total_days: totals?.total_days ?? 0,
		late_days: totals?.late_days ?? 0,
		missing_clockouts: totals?.missing_clockouts ?? 0,
		recent,
	});
});

export default app;
