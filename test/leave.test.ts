import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiPost, applyMigrations, seedOrg } from "./helpers";

interface CreatedRequest {
	request_id: string;
}

async function createRequest(employee = "EMP-1"): Promise<string> {
	const res = await apiPost("/api/leave/request", {
		employee_id: employee,
		type: "annual",
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
		expect((await transition(id, "approve", "HR-1")).status).toBe(200);
		const done = await transition(id, "approve", "DIR-1");
		expect(done.status).toBe(200);
		expect(((await done.json()) as { status: string }).status).toBe("completed");

		const trace = (await (await apiGet(`/api/events?case_id=${id}`)).json()) as { events: { activity: string }[] };
		expect(trace.events.map((e) => e.activity)).toEqual([
			"leave_submitted",
			"manager_review",
			"hr_verification",
			"director_approval",
			"completed",
		]);

		const status = (await (await apiGet(`/api/leave/${id}/status`)).json()) as { status: string; history: unknown[] };
		expect(status.status).toBe("completed");
		expect(status.history).toHaveLength(4);
	});

	it("enforces step roles and department scoping", async () => {
		const id = await createRequest();

		// HR officer cannot act at manager step
		expect((await transition(id, "approve", "HR-1")).status).toBe(403);
		// Manager of the other department cannot act either
		expect((await transition(id, "approve", "MGR-2")).status).toBe(403);
		// Director cannot skip ahead
		expect((await transition(id, "approve", "DIR-1")).status).toBe(403);
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
});
