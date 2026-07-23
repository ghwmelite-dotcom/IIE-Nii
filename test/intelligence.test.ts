import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiPost, applyMigrations } from "./helpers";

const T0 = Date.parse("2026-03-01T08:00:00Z");
const H = 3_600_000;

function leaveCase(caseId: string, activities: string[], gapHours = 24) {
	return activities.map((activity, i) => ({
		case_id: caseId,
		activity,
		resource: "EMP-1",
		timestamp: new Date(T0 + i * gapHours * H).toISOString(),
		source_system: "LEAVE_WORKFLOW",
		metadata: { department: "D1" },
	}));
}

describe("process intelligence end-to-end", () => {
	beforeAll(async () => {
		await applyMigrations();
		const events = [
			...leaveCase("CASE-FULL", ["leave_submitted", "manager_review", "hr_verification", "director_approval", "completed"]),
			...leaveCase("CASE-BYPASS", ["leave_submitted", "hr_verification", "director_approval", "completed"]),
			...leaveCase("CASE-REJECTED", ["leave_submitted", "manager_review", "hr_verification", "rejected"]),
			{
				case_id: "att-EMP-1-2026-03-01",
				activity: "clock_in",
				resource: "EMP-1",
				timestamp: new Date(T0).toISOString(),
				source_system: "ATTENDANCE",
				metadata: {},
			},
			{
				case_id: "att-EMP-1-2026-03-01",
				activity: "clock_out",
				resource: "EMP-1",
				timestamp: new Date(T0 + 9 * H).toISOString(),
				source_system: "ATTENDANCE",
				metadata: {},
			},
		];
		const res = await apiPost("/api/events/batch", events);
		expect(res.status).toBe(201);
		const run = await apiPost("/api/intelligence/run", {});
		expect(run.status).toBe(200);
	});

	it("discovers the workflow variants", async () => {
		const res = await apiGet("/api/intelligence/process-map?source=LEAVE_WORKFLOW");
		const body = (await res.json()) as { models: { case_count: number; variants: { activities: string[] }[] }[] };
		const model = body.models[0];
		expect(model.case_count).toBe(3);
		const signatures = model.variants.map((v) => v.activities.join(">"));
		expect(signatures).toContain("leave_submitted>manager_review>hr_verification>director_approval>completed");
		expect(signatures).toContain("leave_submitted>hr_verification>director_approval>completed");
	});

	it("computes bottleneck stats for the transitions", async () => {
		const res = await apiGet("/api/intelligence/bottlenecks?source=LEAVE_WORKFLOW");
		const body = (await res.json()) as { bottlenecks: { activity_pair: string; median_ms: number }[] };
		const pairs = body.bottlenecks.map((b) => b.activity_pair);
		expect(pairs).toContain("leave_submitted -> manager_review");
		expect(pairs).toContain("manager_review -> hr_verification");
		const step = body.bottlenecks.find((b) => b.activity_pair === "leave_submitted -> manager_review");
		expect(step?.median_ms).toBeGreaterThan(0);
	});

	it("flags the bypass case in conformance checking", async () => {
		const res = await apiGet("/api/intelligence/conformance");
		const body = (await res.json()) as { deviations: { case_id: string; deviation_type: string }[] };
		const bypass = body.deviations.find((d) => d.case_id === "CASE-BYPASS");
		expect(bypass).toBeDefined();
		expect(bypass?.deviation_type).toBe("skipped_step");
		// The conformant full chain and the valid rejection produce no deviations.
		expect(body.deviations.find((d) => d.case_id === "CASE-FULL")).toBeUndefined();
		expect(body.deviations.find((d) => d.case_id === "CASE-REJECTED")).toBeUndefined();
	});

	it("produces recommendations from the analysis", async () => {
		const res = await apiGet("/api/intelligence/recommendations");
		const body = (await res.json()) as { recommendations: unknown[] };
		expect(Array.isArray(body.recommendations)).toBe(true);
	});
});
