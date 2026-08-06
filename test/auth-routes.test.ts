import { beforeAll, describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { applyMigrations, seedOrg } from "./helpers";

const J = { "Content-Type": "application/json", "X-Requested-With": "fetch" };
const post = (p: string, b: unknown, h: Record<string, string> = J) =>
	SELF.fetch(`http://test.local${p}`, { method: "POST", headers: h, body: JSON.stringify(b) });

describe("/auth", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO users (user_id, email, employee_id) VALUES ('u1','staff@ohcs.gov.gh','EMP-1')"),
			env.DB.prepare("INSERT INTO user_roles (user_id, role_id) VALUES ('u1','employee')"),
		]);
	});

	it("request-code returns 202 even for unknown emails (no enumeration)", async () => {
		expect((await post("/auth/request-code", { email: "nobody@example.com" })).status).toBe(202);
	});

	it("request-code without the CSRF header is 403", async () => {
		const res = await SELF.fetch("http://test.local/auth/request-code", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "staff@ohcs.gov.gh" }),
		});
		expect(res.status).toBe(403);
	});

	it("full sign-in: request, read code, verify, session, /auth/me, audit row", async () => {
		await post("/auth/request-code", { email: "staff@ohcs.gov.gh" });
		const code = await env.AUTH.get("otp-plain:staff@ohcs.gov.gh");
		expect(code).toMatch(/^\d{6}$/);
		const res = await post("/auth/verify", { email: "staff@ohcs.gov.gh", code: code! });
		expect(res.status).toBe(200);
		const setCookie = res.headers.get("Set-Cookie");
		expect(setCookie).toContain("iie_session=");
		const me = await SELF.fetch("http://test.local/auth/me", { headers: { Cookie: setCookie!.split(";")[0] } });
		expect(me.status).toBe(200);
		const body = (await me.json()) as { email: string; roles: string[] };
		expect(body.email).toBe("staff@ohcs.gov.gh");
		expect(body.roles).toContain("employee");
		const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='auth.login'").first<{ n: number }>();
		expect(n?.n).toBeGreaterThan(0);
	});

	it("verify rejects a wrong code", async () => {
		await post("/auth/request-code", { email: "staff@ohcs.gov.gh" });
		expect((await post("/auth/verify", { email: "staff@ohcs.gov.gh", code: "999999" })).status).toBe(401);
	});
});
