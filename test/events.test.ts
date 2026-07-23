import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiPost, applyMigrations } from "./helpers";

const VALID_EVENT = {
	case_id: "TEST-1",
	activity: "clock_in",
	resource: "EMP-1",
	source_system: "ATTENDANCE",
	metadata: { department: "D1" },
};

describe("event ingestion API", () => {
	beforeAll(applyMigrations);

	it("rejects unauthenticated writes", async () => {
		const res = await apiPost("/api/events", VALID_EVENT, { "Content-Type": "application/json" });
		expect(res.status).toBe(401);
	});

	it("ingests a valid event with a server-generated id", async () => {
		const res = await apiPost("/api/events", VALID_EVENT);
		expect(res.status).toBe(201);
		const body = (await res.json()) as { event_id: string };
		expect(body.event_id).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("rejects an invalid source_system", async () => {
		const res = await apiPost("/api/events", { ...VALID_EVENT, source_system: "PAYROLL" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Invalid event");
	});

	it("rejects malformed JSON", async () => {
		const res = await apiPost("/api/events", "not json");
		expect(res.status).toBe(400);
	});

	it("ingests batches and returns the trace in order", async () => {
		const batch = [
			{ ...VALID_EVENT, case_id: "TRACE-1", activity: "clock_in", timestamp: "2026-03-01T08:00:00Z" },
			{ ...VALID_EVENT, case_id: "TRACE-1", activity: "clock_out", timestamp: "2026-03-01T17:00:00Z" },
		];
		const res = await apiPost("/api/events/batch", batch);
		expect(res.status).toBe(201);
		expect(((await res.json()) as { ingested: number }).ingested).toBe(2);

		const trace = await apiGet("/api/events?case_id=TRACE-1");
		const body = (await trace.json()) as { count: number; events: { activity: string }[] };
		expect(body.count).toBe(2);
		expect(body.events.map((e) => e.activity)).toEqual(["clock_in", "clock_out"]);
	});

	it("requires case_id on the trace endpoint", async () => {
		const res = await apiGet("/api/events");
		expect(res.status).toBe(400);
	});

	it("streams newly ingested events over SSE", async () => {
		const res = await apiGet("/api/events/stream");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/event-stream");

		const reader = res.body!.getReader();
		try {
			// Ingest after connecting — the stream must push it within one flush interval.
			await apiPost("/api/events", { ...VALID_EVENT, case_id: "SSE-1" });
			const deadline = Date.now() + 8000;
			let received = "";
			while (Date.now() < deadline && !received.includes("SSE-1")) {
				const { value, done } = await reader.read();
				if (done) break;
				received += new TextDecoder().decode(value);
			}
			expect(received).toContain("SSE-1");
			expect(received).toContain("data: ");
		} finally {
			await reader.cancel();
		}
	}, 15_000);
});
