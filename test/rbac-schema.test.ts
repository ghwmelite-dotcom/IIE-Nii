import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, seedOrg } from "./helpers";

describe("rbac schema", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
	});

	it("stores a user linked to an employee", async () => {
		await env.DB.prepare(
			"INSERT INTO users (user_id, email, employee_id) VALUES ('u1', 'a@ohcs.gov.gh', 'EMP-1')",
		).run();
		const row = await env.DB.prepare("SELECT email, status FROM users WHERE user_id='u1'").first<{ email: string; status: string }>();
		expect(row?.email).toBe("a@ohcs.gov.gh");
		expect(row?.status).toBe("active");
	});

	it("allows one user to hold multiple scoped roles and dedupes global grants", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO user_roles (user_id, role_id) VALUES ('u1','executive')"),
			env.DB.prepare("INSERT INTO user_roles (user_id, role_id, scope_type, scope_id) VALUES ('u1','employee','department','D1')"),
		]);
		// duplicate GLOBAL grant must be ignored (scope_id defaults to '')
		await env.DB.prepare("INSERT INTO user_roles (user_id, role_id) VALUES ('u1','executive') ON CONFLICT DO NOTHING").run();
		const { results } = await env.DB.prepare("SELECT role_id, scope_id FROM user_roles WHERE user_id='u1' ORDER BY role_id").all();
		expect(results.length).toBe(2);
	});

	it("writes an audit row", async () => {
		await env.DB.prepare(
			"INSERT INTO audit_log (id, actor_user_id, actor_email, action, target_type, target_id) VALUES ('a1','u1','a@ohcs.gov.gh','test.action','x','y')",
		).run();
		const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>();
		expect(n?.n).toBe(1);
	});
});
