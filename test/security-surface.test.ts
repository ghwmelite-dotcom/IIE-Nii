import { beforeAll, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authGet, apiPost, API_HEADERS } from "./helpers";

describe("security surface: headers + events routes", () => {
	beforeAll(async () => { await applyMigrations(); await seedOrg(); });

	it("adds security headers (incl. CSP) to responses", async () => {
		const res = await SELF.fetch("http://test.local/health");
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
	});

	it("events read routes 401 without a session", async () => {
		expect((await SELF.fetch("http://test.local/api/events/recent")).status).toBe(401);
		expect((await SELF.fetch("http://test.local/api/events?case_id=x")).status).toBe(401);
	});

	it("M2M event ingestion still works with the API key (regression)", async () => {
		const res = await apiPost("/api/events", { case_id: "SEC-1", activity: "clock_in", resource: "EMP-1", source_system: "ATTENDANCE", metadata: {} }, API_HEADERS);
		expect(res.status).toBe(201);
	});

	it("case-trace read requires events.read.any: employee 403, analyst 200", async () => {
		const emp = await seedUser("u-emp", "emp@ohcs.gov.gh", "EMP-1", ["employee"]);
		const analyst = await seedUser("u-an", "an@ohcs.gov.gh", "MGR-1", ["process_analyst"]);
		expect((await authGet("/api/events?case_id=SEC-1", emp)).status).toBe(403);
		expect((await authGet("/api/events?case_id=SEC-1", analyst)).status).toBe(200);
		// a signed-in user can read the live feed
		expect((await authGet("/api/events/recent", emp)).status).toBe(200);
	});
});
