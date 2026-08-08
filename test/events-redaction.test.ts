import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, seedOrg, seedUser, authGet, apiPost, API_HEADERS } from "./helpers";

describe("event feed PII redaction", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
		await apiPost("/api/events", { case_id: "RED-1", activity: "clock_in", resource: "EMP-1", source_system: "ATTENDANCE", metadata: { late: true } }, API_HEADERS);
	});

	it("hides resource + metadata from ordinary employees but keeps them for analysts", async () => {
		const emp = await seedUser("u-r1", "r1@ohcs.gov.gh", "EMP-1", ["employee"]);
		const analyst = await seedUser("u-r2", "r2@ohcs.gov.gh", "MGR-1", ["process_analyst"]);
		const empFeed = (await (await authGet("/api/events/recent", emp)).json()) as { events: Record<string, unknown>[] };
		const anFeed = (await (await authGet("/api/events/recent", analyst)).json()) as { events: Record<string, unknown>[] };
		const empRow = empFeed.events.find((e) => e.case_id === "RED-1")!;
		const anRow = anFeed.events.find((e) => e.case_id === "RED-1")!;
		expect(empRow.resource).toBeUndefined();
		expect(empRow.metadata).toBeUndefined();
		expect(empRow.activity).toBe("clock_in");
		expect(anRow.resource).toBe("EMP-1");
		expect((anRow.metadata as { late: boolean }).late).toBe(true);
	});
});
