import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, seedOrg, seedUser, authGet } from "./helpers";

let cookie: string;

describe("org directory API", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
		cookie = await seedUser("u-org-test", "org-test@test.local", null, ["employee"]);
	});

	it("lists employees with id, name, department and role", async () => {
		const res = await authGet("/api/org/employees", cookie);
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
