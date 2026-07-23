import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiPost, applyMigrations, seedOrg } from "./helpers";

interface CreatedRequest {
	request_id: string;
}

async function createRequest(employee = "EMP-1", type = "annual"): Promise<string> {
	const res = await apiPost("/api/leave/request", {
		employee_id: employee,
		type,
		start_date: "2026-08-03",
		end_date: "2026-08-07",
	});
	expect(res.status).toBe(201);
	return ((await res.json()) as CreatedRequest).request_id;
}

function transition(id: string, action: string, actor: string, reason?: string) {
	return apiPost(`/api/leave/${id}/transition`, { action, actor_id: actor, ...(reason ? { reason } : {}) });
}

describe("leave workflow state machine", () => {
	beforeAll(async () => {
		await applyMigrations();
		await seedOrg();
	});

	it("walks the full approval chain and emits the prescribed event trace", async () => {
		const id = await createRequest();

		expect((await transition(id, "approve", "MGR-1")).status).toBe(200);
		expect((await transition(id, "approve", "ADM-F&A")).status).toBe(200);
		const done = await transition(id, "approve", "DIR-F&A");
		expect(done.status).toBe(200);
		expect(((await done.json()) as { status: string }).status).toBe("completed");

		const trace = (await (await apiGet(`/api/events?case_id=${id}`)).json()) as { events: { activity: string }[] };
		expect(trace.events.map((e) => e.activity)).toEqual([
			"leave_submitted",
			"supervisor_review",
			"fa_verification",
			"director_fa_approval",
			"completed",
		]);

		const status = (await (await apiGet(`/api/leave/${id}/status`)).json()) as { status: string; history: unknown[] };
		expect(status.status).toBe("completed");
		expect(status.history).toHaveLength(4);
	});

	it("routes study leave through RTDD: schedule officer reviews, Director RTDD approves", async () => {
		const id = await createRequest("EMP-1", "study");

		expect((await transition(id, "approve", "MGR-1")).status).toBe(200);
		// After supervisor review a study request waits at rtdd_review — F&A cannot touch it.
		const status = (await (await apiGet(`/api/leave/${id}/status`)).json()) as { current_step: string };
		expect(status.current_step).toBe("rtdd_review");
		expect((await transition(id, "approve", "ADM-F&A")).status).toBe(403);
		expect((await transition(id, "approve", "SO-RTDD")).status).toBe(200);
		// Only Director RTDD may approve study leave.
		expect((await transition(id, "approve", "DIR-F&A")).status).toBe(403);
		const done = await transition(id, "approve", "DIR-RTDD");
		expect(((await done.json()) as { status: string }).status).toBe("completed");

		const trace = (await (await apiGet(`/api/events?case_id=${id}`)).json()) as { events: { activity: string }[] };
		expect(trace.events.map((e) => e.activity)).toEqual([
			"leave_submitted",
			"supervisor_review",
			"rtdd_review",
			"director_rtdd_approval",
			"completed",
		]);
	});

	it("restricts F&A verification and approval to F&A officers", async () => {
		const id = await createRequest();
		await transition(id, "approve", "MGR-1");
		// RTDD's schedule officer cannot verify standard leave; CMD HR cannot either.
		expect((await transition(id, "approve", "SO-RTDD")).status).toBe(403);
		expect((await transition(id, "approve", "HR-1")).status).toBe(403);
		await transition(id, "approve", "ADM-F&A");
		// A director from outside F&A cannot give final approval.
		expect((await transition(id, "approve", "DIR-RTDD")).status).toBe(403);
		expect((await transition(id, "approve", "DIR-F&A")).status).toBe(200);
	});

	it("enforces step roles and department scoping", async () => {
		const id = await createRequest();

		// HR officer cannot act at manager step
		expect((await transition(id, "approve", "HR-1")).status).toBe(403);
		// Manager of the other department cannot act either
		expect((await transition(id, "approve", "MGR-2")).status).toBe(403);
		// Director cannot skip ahead
		expect((await transition(id, "approve", "DIR-F&A")).status).toBe(403);
	});

	it("requires a reason for rejection", async () => {
		const id = await createRequest();
		expect((await transition(id, "reject", "MGR-1")).status).toBe(400);
		const rejected = await transition(id, "reject", "MGR-1", "staffing constraints");
		expect(rejected.status).toBe(200);
		expect(((await rejected.json()) as { status: string }).status).toBe("rejected");
	});

	it("allows only the requester to cancel", async () => {
		const id = await createRequest();
		expect((await transition(id, "cancel", "MGR-1")).status).toBe(403);
		const cancelled = await transition(id, "cancel", "EMP-1");
		expect(cancelled.status).toBe(200);
		expect(((await cancelled.json()) as { status: string }).status).toBe("cancelled");
	});

	it("rejects transitions on terminal requests", async () => {
		const id = await createRequest();
		await transition(id, "cancel", "EMP-1");
		expect((await transition(id, "approve", "MGR-1")).status).toBe(409);
	});

	it("rejects unknown employees and actors", async () => {
		const res = await apiPost("/api/leave/request", {
			employee_id: "NOPE",
			type: "annual",
			start_date: "2026-08-03",
			end_date: "2026-08-07",
		});
		expect(res.status).toBe(404);

		const id = await createRequest();
		expect((await transition(id, "approve", "NOPE")).status).toBe(404);
	});

	it("validates the request payload", async () => {
		const res = await apiPost("/api/leave/request", {
			employee_id: "EMP-1",
			type: "annual",
			start_date: "2026-08-07",
			end_date: "2026-08-03",
		});
		expect(res.status).toBe(400);
	});

	it("lists an employee's own requests, latest first", async () => {
		const first = await createRequest();
		const second = await createRequest();

		const res = await apiGet("/api/leave?employee_id=EMP-1");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { requests: { request_id: string; employee_id: string }[] };
		expect(body.requests.length).toBeGreaterThanOrEqual(2);
		expect(body.requests.every((r) => r.employee_id === "EMP-1")).toBe(true);
		expect(body.requests[0].request_id).toBe(second);
		expect(body.requests.map((r) => r.request_id)).toContain(first);
	});

	it("lists the pending approver inbox, filterable by step", async () => {
		const id = await createRequest();

		const inbox = (await (await apiGet("/api/leave")).json()) as {
			requests: { request_id: string; status: string; current_step: string }[];
		};
		expect(inbox.requests.every((r) => r.status === "pending")).toBe(true);
		expect(inbox.requests.map((r) => r.request_id)).toContain(id);

		const atStep = (await (await apiGet("/api/leave?current_step=supervisor_review")).json()) as {
			requests: { request_id: string; current_step: string }[];
		};
		expect(atStep.requests.every((r) => r.current_step === "supervisor_review")).toBe(true);
		expect(atStep.requests.map((r) => r.request_id)).toContain(id);

		const wrongStep = (await (await apiGet("/api/leave?current_step=director_fa_approval")).json()) as {
			requests: { request_id: string }[];
		};
		expect(wrongStep.requests.map((r) => r.request_id)).not.toContain(id);
	});
});
