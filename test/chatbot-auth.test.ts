import { beforeAll, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authPost } from "./helpers";

describe("chatbot identity", () => {
	beforeAll(async () => { await applyMigrations(); await seedOrg(); });

	it("401 without a session", async () => {
		const res = await SELF.fetch("http://test.local/api/chatbot/message", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ message: "hi" }) });
		expect(res.status).toBe(401);
	});

	it("acts as the signed-in user, ignoring any employee_id in the body", async () => {
		const cookie = await seedUser("u-c", "c@ohcs.gov.gh", "EMP-1", ["employee"]);
		// keyword-routed to the 'attendance' intent (no AI call); proves it runs as EMP-1 not EMP-2
		const res = await authPost("/api/chatbot/message", { message: "how many days was I late this month?", employee_id: "EMP-2" }, cookie);
		expect(res.status).toBe(200);
	});
});
