import { beforeAll, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authGet } from "./helpers";

describe("reports routes", () => {
	beforeAll(async () => { await applyMigrations(); await seedOrg(); });

	it("401 unauth, 403 employee, 200 hr_admin, 200 exec", async () => {
		expect((await SELF.fetch("http://test.local/api/reports/weekly")).status).toBe(401);
		const emp = await seedUser("u-e", "e@ohcs.gov.gh", "EMP-1", ["employee"]);
		expect((await authGet("/api/reports/weekly", emp)).status).toBe(403);
		const hr = await seedUser("u-hr", "hr@ohcs.gov.gh", "HR-1", ["hr_admin"]);
		expect((await authGet("/api/reports/weekly", hr)).status).toBe(200);
		const exec = await seedUser("u-x", "x@ohcs.gov.gh", "MGR-1", ["executive"]);
		expect((await authGet("/api/reports/weekly", exec)).status).toBe(200);
	});

	it("csv download and printable html", async () => {
		const exec = await seedUser("u-x2", "x2@ohcs.gov.gh", "MGR-2", ["executive"]);
		const csv = await authGet("/api/reports/monthly/csv", exec);
		expect(csv.status).toBe(200);
		expect(csv.headers.get("Content-Type")).toContain("text/csv");
		const html = await authGet("/api/reports/yearly/html", exec);
		expect(html.status).toBe(200);
		expect(html.headers.get("Content-Type")).toContain("text/html");
	});

	it("rejects an invalid period", async () => {
		const exec = await seedUser("u-x3", "x3@ohcs.gov.gh", "HR-1", ["executive"]);
		expect((await authGet("/api/reports/daily", exec)).status).toBe(400);
	});
});
