import { beforeAll, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authGet, API_HEADERS } from "./helpers";

describe("attendance security", () => {
	beforeAll(async () => { await applyMigrations(); await seedOrg(); });

	it("clock-in requires the API key (RFID reader)", async () => {
		const noKey = await SELF.fetch("http://test.local/api/attendance/clock-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: "EMP-1" }) });
		expect(noKey.status).toBe(401);
		const withKey = await SELF.fetch("http://test.local/api/attendance/clock-in", { method: "POST", headers: API_HEADERS, body: JSON.stringify({ employee_id: "EMP-1" }) });
		expect(withKey.status).toBe(201);
	});

	it("a user can read their own summary but not another's", async () => {
		const cookie = await seedUser("u-e1", "e1@ohcs.gov.gh", "EMP-1", ["employee"]);
		expect((await authGet("/api/attendance/EMP-1/summary", cookie)).status).toBe(200);
		expect((await authGet("/api/attendance/EMP-2/summary", cookie)).status).toBe(403);
	});

	it("hr_admin can read anyone's summary", async () => {
		const cookie = await seedUser("u-hr2", "hr2@ohcs.gov.gh", "HR-1", ["hr_admin"]);
		expect((await authGet("/api/attendance/EMP-2/summary", cookie)).status).toBe(200);
	});
});
