import { describe, expect, it } from "vitest";
import { buildModel } from "../src/mining/graph";
import { checkLeaveConformance } from "../src/mining/conformance";

describe("buildModel (directly-follows graph)", () => {
	it("builds nodes, edges, and variants from ordered traces", () => {
		const events = [
			{ case_id: "A", activity: "start", timestamp: "2026-01-01T00:00:00Z" },
			{ case_id: "A", activity: "middle", timestamp: "2026-01-01T01:00:00Z" },
			{ case_id: "A", activity: "end", timestamp: "2026-01-01T02:00:00Z" },
			{ case_id: "B", activity: "start", timestamp: "2026-01-02T00:00:00Z" },
			{ case_id: "B", activity: "end", timestamp: "2026-01-02T01:00:00Z" },
		];
		const model = buildModel(events);

		expect(model.caseCount).toBe(2);
		expect(model.eventCount).toBe(5);
		expect(model.nodes).toHaveLength(3);
		expect(model.edges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ from: "start", to: "middle", count: 1 }),
				expect.objectContaining({ from: "middle", to: "end", count: 1 }),
				expect.objectContaining({ from: "start", to: "end", count: 1 }),
			]),
		);
		expect(model.variants).toHaveLength(2);
		expect(model.variants[0].activities).toEqual(["start", "middle", "end"]);
	});

	it("computes dependency scores from forward/reverse frequencies", () => {
		const events = [
			{ case_id: "A", activity: "x", timestamp: "2026-01-01T00:00:00Z" },
			{ case_id: "A", activity: "y", timestamp: "2026-01-01T01:00:00Z" },
			{ case_id: "B", activity: "y", timestamp: "2026-01-02T00:00:00Z" },
			{ case_id: "B", activity: "x", timestamp: "2026-01-02T01:00:00Z" },
			{ case_id: "C", activity: "x", timestamp: "2026-01-03T00:00:00Z" },
			{ case_id: "C", activity: "y", timestamp: "2026-01-03T01:00:00Z" },
		];
		const model = buildModel(events);
		const edge = model.edges.find((e) => e.from === "x" && e.to === "y");
		// forward 2, reverse 1 → (2 − 1) / (2 + 1 + 1) = 0.25
		expect(edge?.dependency).toBeCloseTo(0.25, 3);
	});
});

describe("checkLeaveConformance", () => {
	const chain = (activities: string[], caseId = "C1") =>
		activities.map((activity, i) => ({
			case_id: caseId,
			activity,
			timestamp: new Date(2026, 0, i + 1).toISOString(),
		}));

	it("accepts the prescribed full chain", () => {
		expect(
			checkLeaveConformance(chain(["leave_submitted", "supervisor_review", "fa_verification", "director_fa_approval", "completed"])),
		).toHaveLength(0);
	});

	it("flags a manager bypass as skipped_step", () => {
		const deviations = checkLeaveConformance(chain(["leave_submitted", "fa_verification", "director_fa_approval", "completed"]));
		expect(deviations).toHaveLength(1);
		expect(deviations[0].deviation_type).toBe("skipped_step");
		expect(deviations[0].description).toContain("supervisor_review");
		expect(deviations[0].score).toBeCloseTo(0.8, 2);
	});

	it("accepts rejection after HR verification (prescribed prefix)", () => {
		expect(checkLeaveConformance(chain(["leave_submitted", "supervisor_review", "fa_verification", "rejected"]))).toHaveLength(0);
	});

	it("flags a bypass that ends in rejection", () => {
		const deviations = checkLeaveConformance(chain(["leave_submitted", "fa_verification", "rejected"]));
		expect(deviations.some((d) => d.deviation_type === "skipped_step")).toBe(true);
	});

	it("exempts cancellations", () => {
		expect(checkLeaveConformance(chain(["leave_submitted", "supervisor_review", "cancelled"]))).toHaveLength(0);
	});

	it("ignores in-flight (non-terminal) cases", () => {
		expect(checkLeaveConformance(chain(["leave_submitted"]))).toHaveLength(0);
		expect(checkLeaveConformance(chain(["leave_submitted", "supervisor_review"]))).toHaveLength(0);
	});

	it("flags out-of-order execution", () => {
		const deviations = checkLeaveConformance(
			chain(["leave_submitted", "fa_verification", "supervisor_review", "director_fa_approval", "completed"]),
		);
		expect(deviations.some((d) => d.deviation_type === "out_of_order")).toBe(true);
	});
});
