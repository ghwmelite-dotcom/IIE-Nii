import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { applyMigrations, seedOrg } from "./helpers";
import { requireUser, requirePermission } from "../src/lib/auth";
import { createSession } from "../src/lib/session";

async function sessionCookie() {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO users (user_id, email, employee_id) VALUES ('m-u','m@ohcs.gov.gh','EMP-1') ON CONFLICT DO NOTHING"),
		env.DB.prepare("INSERT INTO user_roles (user_id, role_id) VALUES ('m-u','process_analyst') ON CONFLICT DO NOTHING"),
	]);
	const { cookie } = await createSession(env, { userId: "m-u", email: "m@ohcs.gov.gh" });
	return cookie;
}

describe("auth middleware", () => {
	beforeAll(async () => { await applyMigrations(); await seedOrg(); });

	it("401s without a session", async () => {
		const app = new Hono<{ Bindings: Env }>();
		app.get("/x", requireUser, (c) => c.json({ ok: true }));
		const res = await app.request("/x", {}, env);
		expect(res.status).toBe(401);
	});

	it("passes with a valid session and enforces capability", async () => {
		const cookie = await sessionCookie();
		const app = new Hono<{ Bindings: Env }>();
		app.get("/intel", requireUser, requirePermission("intelligence.read"), (c) => c.json({ ok: true }));
		app.get("/admin", requireUser, requirePermission("admin.users.manage"), (c) => c.json({ ok: true }));
		expect((await app.request("/intel", { headers: { Cookie: cookie } }, env)).status).toBe(200);
		expect((await app.request("/admin", { headers: { Cookie: cookie } }, env)).status).toBe(403);
	});
});
