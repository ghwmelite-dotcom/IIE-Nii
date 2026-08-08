import { beforeAll, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authGet } from "./helpers";

describe("route gating: org / stats / intelligence", () => {
	beforeAll(async () => { await applyMigrations(); await seedOrg(); });

	it("org directory and stats require a session (any role)", async () => {
		expect((await SELF.fetch("http://test.local/api/org/employees")).status).toBe(401);
		expect((await SELF.fetch("http://test.local/api/stats/overview")).status).toBe(401);
		const emp = await seedUser("u-g", "g@ohcs.gov.gh", "EMP-1", ["employee"]);
		expect((await authGet("/api/org/employees", emp)).status).toBe(200);
		expect((await authGet("/api/stats/overview", emp)).status).toBe(200);
	});

	it("intelligence requires the intelligence.read capability", async () => {
		expect((await SELF.fetch("http://test.local/api/intelligence/bottlenecks")).status).toBe(401);
		const emp = await seedUser("u-g2", "g2@ohcs.gov.gh", "EMP-2", ["employee"]);
		expect((await authGet("/api/intelligence/bottlenecks", emp)).status).toBe(403);
		const analyst = await seedUser("u-g3", "g3@ohcs.gov.gh", "MGR-1", ["process_analyst"]);
		expect((await authGet("/api/intelligence/bottlenecks", analyst)).status).toBe(200);
	});
});
