import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authGet, authPost } from "./helpers";

describe("admin api", () => {
	let admin: string;
	let empX: string;
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
		await env.DB.prepare("UPDATE employees SET email = employee_id || '@ohcs.gov.gh' WHERE email IS NULL").run();
		admin = await seedUser("u-admin", "admin@ohcs.gov.gh", "HR-1", ["system_admin"]);
		empX = await seedUser("u-x", "x@ohcs.gov.gh", "EMP-1", ["employee"]);
	});

	it("non-admins are forbidden", async () => {
		expect((await authGet("/api/admin/users", empX)).status).toBe(403);
	});

	it("bulk-provisions and lists users", async () => {
		const prov = await authPost("/api/admin/provision", {}, admin);
		expect(prov.status).toBe(200);
		const list = (await (await authGet("/api/admin/users", admin)).json()) as { users: unknown[] };
		expect(list.users.length).toBeGreaterThan(1);
	});

	it("grants and revokes a scoped role", async () => {
		await authPost("/api/admin/users/u-x/roles", { role_id: "executive" }, admin);
		let u = (await (await authGet("/api/admin/users/u-x", admin)).json()) as { roles: { role_id: string }[] };
		expect(u.roles.some((r) => r.role_id === "executive")).toBe(true);
		await authPost("/api/admin/users/u-x/roles/revoke", { role_id: "executive" }, admin);
		u = (await (await authGet("/api/admin/users/u-x", admin)).json()) as { roles: { role_id: string }[] };
		expect(u.roles.some((r) => r.role_id === "executive")).toBe(false);
	});
});
