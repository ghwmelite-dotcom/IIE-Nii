import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authGet } from "./helpers";
import { runReportJob } from "../src/jobs/reports";
import { sendTelegram } from "../src/lib/telegram";

describe("scheduled report job", () => {
	beforeAll(async () => { await applyMigrations(); await seedOrg(); });

	it("archives CSV + HTML to R2 and no-ops Telegram when unconfigured", async () => {
		const res = await runReportJob(env, "weekly");
		expect(res.archived.length).toBe(2);
		const list = await env.POLICY_DOCS.list({ prefix: "reports/weekly/" });
		expect(list.objects.length).toBeGreaterThan(0);
		expect(await sendTelegram(env, "test")).toBe(false); // no token configured
	});

	it("exposes archived reports via the API to employees and executives", async () => {
		await runReportJob(env, "monthly");
		const exec = await seedUser("u-arch", "arch@ohcs.gov.gh", "MGR-1", ["executive"]);
		const listRes = await authGet("/api/reports/archive", exec);
		expect(listRes.status).toBe(200);
		const body = (await listRes.json()) as { objects: { key: string }[] };
		expect(body.objects.length).toBeGreaterThan(0);
		const emp = await seedUser("u-ne", "ne@ohcs.gov.gh", "EMP-1", ["employee"]);
		expect((await authGet("/api/reports/archive", emp)).status).toBe(200);
	});
});
