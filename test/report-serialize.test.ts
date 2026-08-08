import { describe, expect, it } from "vitest";
import { reportToCsv } from "../src/lib/report-csv";
import { reportToHtml } from "../src/lib/report-html";
import type { ReportData } from "../src/lib/reports";

const D: ReportData = {
	meta: { period: "monthly", start: "2026-02-08T00:00:00Z", end: "2026-03-10T00:00:00Z", generated_at: "2026-03-10T00:00:00Z" },
	summary: { employees: 150, events: 42, leave_submitted: 5, leave_completed: 3, avg_leave_cycle_days: 4.2, late_rate: 0.12 },
	attendance: { clock_ins: 100, late: 12, late_rate: 0.12, by_department: [{ department: "F&A", clock_ins: 50, late: 5, late_rate: 0.1 }] },
	leave: { submitted: 5, completed: 3, rejected: 1, cancelled: 1, avg_cycle_days: 4.2, by_type: [{ type: "annual", count: 4 }] },
	process: { flagged_bottlenecks: 2, top_bottleneck: "supervisor_review → fa_verification", conformance_rate: 0.91, variant_count: 6 },
	recommendations: [{ kind: "bottleneck", severity: "high", title: "Slow step", detail: "Fix it" }],
};

describe("report serialization", () => {
	it("csv includes sections and values", () => {
		const csv = reportToCsv(D);
		expect(csv).toContain("Summary");
		expect(csv).toContain("annual");
		expect(csv).toContain("Recommendations");
		expect(csv).toContain("Slow step");
	});
	it("html is a standalone printable doc with the period and a table", () => {
		const html = reportToHtml(D);
		expect(html.toLowerCase()).toContain("<!doctype html>");
		expect(html).toContain("Monthly report");
		expect(html).toContain("supervisor_review");
		expect(html).toContain("<table>");
	});
});
