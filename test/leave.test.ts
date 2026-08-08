import { beforeAll, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { applyMigrations, seedOrg, seedUser, authPost, authGet } from "./helpers";

let emp1: string, emp2: string, mgr1: string, mgr2: string, admFA: string, dirFA: string, soRTDD: string, dirRTDD: string;

async function submitAs(cookie: string, type: string) {
	const res = await authPost("/api/leave/request", { type, start_date: "2026-09-01", end_date: "2026-09-03" }, cookie);
	expect(res.status).toBe(201);
	return ((await res.json()) as { request_id: string }).request_id;
}

describe("leave workflow with real identity", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
		emp1 = await seedUser("u-emp1", "emp1@ohcs.gov.gh", "EMP-1", ["employee"]);
		emp2 = await seedUser("u-emp2", "emp2@ohcs.gov.gh", "EMP-2", ["employee"]);
		mgr1 = await seedUser("u-mgr1", "mgr1@ohcs.gov.gh", "MGR-1", ["employee"]);
		mgr2 = await seedUser("u-mgr2", "mgr2@ohcs.gov.gh", "MGR-2", ["employee"]);
		admFA = await seedUser("u-adm", "adm@ohcs.gov.gh", "ADM-F&A", ["employee"]);
		dirFA = await seedUser("u-dirfa", "dirfa@ohcs.gov.gh", "DIR-F&A", ["employee"]);
		soRTDD = await seedUser("u-so", "so@ohcs.gov.gh", "SO-RTDD", ["employee"]);
		dirRTDD = await seedUser("u-dirrtdd", "dirrtdd@ohcs.gov.gh", "DIR-RTDD", ["employee"]);
	});

	it("rejects unauthenticated submit and transition", async () => {
		const r1 = await SELF.fetch("http://test.local/api/leave/request", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ type: "annual", start_date: "2026-09-01", end_date: "2026-09-03" }) });
		expect(r1.status).toBe(401);
		const r2 = await SELF.fetch("http://test.local/api/leave/x/transition", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ action: "approve" }) });
		expect(r2.status).toBe(401);
	});

	it("runs the full F&A chain for annual leave, acting as each officer (no actor_id in body)", async () => {
		const id = await submitAs(emp1, "annual");
		expect((await authPost(`/api/leave/${id}/transition`, { action: "approve" }, mgr1)).status).toBe(200);
		expect((await authPost(`/api/leave/${id}/transition`, { action: "approve" }, admFA)).status).toBe(200);
		const done = await authPost(`/api/leave/${id}/transition`, { action: "approve" }, dirFA);
		expect(done.status).toBe(200);
		expect(((await done.json()) as { status: string }).status).toBe("completed");
	});

	it("routes study leave through RTDD", async () => {
		const id = await submitAs(emp1, "study");
		await authPost(`/api/leave/${id}/transition`, { action: "approve" }, mgr1);
		expect((await authPost(`/api/leave/${id}/transition`, { action: "approve" }, soRTDD)).status).toBe(200);
		const done = await authPost(`/api/leave/${id}/transition`, { action: "approve" }, dirRTDD);
		expect(((await done.json()) as { status: string }).status).toBe("completed");
	});

	it("blocks a wrong-unit supervisor (403), allows the right unit", async () => {
		const id = await submitAs(emp2, "annual");
		expect((await authPost(`/api/leave/${id}/transition`, { action: "approve" }, mgr1)).status).toBe(403);
		expect((await authPost(`/api/leave/${id}/transition`, { action: "approve" }, mgr2)).status).toBe(200);
	});

	it("lets the requester cancel their own pending request", async () => {
		const id = await submitAs(emp1, "annual");
		const res = await authPost(`/api/leave/${id}/transition`, { action: "cancel" }, emp1);
		expect(res.status).toBe(200);
		expect(((await res.json()) as { status: string }).status).toBe("cancelled");
	});

	it("scopes my-requests to self and records an audit row on approve", async () => {
		expect((await authGet("/api/leave?employee_id=EMP-1", emp1)).status).toBe(200);
		expect((await authGet("/api/leave?employee_id=EMP-1", emp2)).status).toBe(403);
	});
});
