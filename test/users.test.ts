import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, seedOrg } from "./helpers";
import { findActiveUserByEmail, loadUserContext, bulkProvisionFromEmployees } from "../src/lib/users";

describe("users", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
		await env.DB.prepare("UPDATE employees SET email = employee_id || '@ohcs.gov.gh' WHERE email IS NULL").run();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO users (user_id, email, employee_id) VALUES ('u-hr','hr@ohcs.gov.gh','HR-1')"),
			env.DB.prepare("INSERT INTO user_roles (user_id, role_id) VALUES ('u-hr','hr_admin')"),
			env.DB.prepare("INSERT INTO user_roles (user_id, role_id) VALUES ('u-hr','employee')"),
			env.DB.prepare("INSERT INTO users (user_id, email, employee_id, status) VALUES ('u-off','off@ohcs.gov.gh','EMP-2','disabled')"),
		]);
	});

	it("finds an active user by email (case-insensitive), not a disabled one", async () => {
		expect((await findActiveUserByEmail(env, "HR@ohcs.gov.gh"))?.user_id).toBe("u-hr");
		expect(await findActiveUserByEmail(env, "off@ohcs.gov.gh")).toBeNull();
	});

	it("loads roles, capabilities and linked employee", async () => {
		const ctx = await loadUserContext(env, "u-hr");
		expect(ctx?.roles.sort()).toEqual(["employee", "hr_admin"]);
		expect(ctx?.capabilities).toContain("attendance.read.any");
		expect(ctx?.employee?.department_id).toBe("D1");
	});

	it("bulk-provisions employee users idempotently", async () => {
		const first = await bulkProvisionFromEmployees(env);
		expect(first.created).toBeGreaterThan(0);
		const second = await bulkProvisionFromEmployees(env);
		expect(second.created).toBe(0);
	});
});
