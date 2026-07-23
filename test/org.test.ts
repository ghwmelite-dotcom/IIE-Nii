import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, applyMigrations, seedOrg } from "./helpers";

describe("org directory API", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
	});

	it("lists employees with id, name, department and role", async () => {
		const res = await apiGet("/api/org/employees");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { employees: { employee_id: string; name: string; department_id: string; role: string }[] };
		expect(body.employees.length).toBe(9);
		const mgr = body.employees.find((e) => e.employee_id === "MGR-1");
		expect(mgr).toMatchObject({ name: "Manager One", department_id: "D1", role: "line_manager" });
		// Ordered by employee_id
		const ids = body.employees.map((e) => e.employee_id);
		expect(ids).toEqual([...ids].sort());
	});
});
