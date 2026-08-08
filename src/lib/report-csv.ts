import type { ReportData } from "./reports";

const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const rows = (rs: unknown[][]) => rs.map((r) => r.map(cell).join(",")).join("\n");
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function reportToCsv(d: ReportData): string {
	return [
		`IIE ${d.meta.period} report,${d.meta.start.slice(0, 10)} to ${d.meta.end.slice(0, 10)},generated ${d.meta.generated_at}`,
		"",
		"Summary",
		rows([
			["Employees", d.summary.employees],
			["Events in period", d.summary.events],
			["Leave submitted", d.summary.leave_submitted],
			["Leave completed", d.summary.leave_completed],
			["Avg leave cycle (days)", d.summary.avg_leave_cycle_days ?? "—"],
			["Late rate", pct(d.summary.late_rate)],
		]),
		"",
		"Attendance by department",
		rows([["Department", "Clock-ins", "Late", "Late rate"], ...d.attendance.by_department.map((x) => [x.department, x.clock_ins, x.late, pct(x.late_rate)])]),
		"",
		"Leave by type",
		rows([["Type", "Count"], ...d.leave.by_type.map((x) => [x.type, x.count])]),
		"",
		"Leave outcomes",
		rows([["Submitted", d.leave.submitted], ["Completed", d.leave.completed], ["Rejected", d.leave.rejected], ["Cancelled", d.leave.cancelled], ["Avg cycle (days)", d.leave.avg_cycle_days ?? "—"]]),
		"",
		"Process",
		rows([["Flagged bottlenecks", d.process.flagged_bottlenecks], ["Top bottleneck", d.process.top_bottleneck ?? "—"], ["Conformance rate", pct(d.process.conformance_rate)], ["Workflow variants", d.process.variant_count]]),
		"",
		"Recommendations",
		rows([["Severity", "Kind", "Title", "Detail"], ...d.recommendations.map((r) => [r.severity, r.kind, r.title, r.detail])]),
	].join("\n");
}
