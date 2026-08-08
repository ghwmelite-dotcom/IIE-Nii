import type { ReportData } from "./reports";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const tbl = (headers: string[], body: (string | number)[][]) =>
	`<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body
		.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join("")}</tr>`)
		.join("")}</tbody></table>`;

export function reportToHtml(d: ReportData): string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>IIE ${d.meta.period} report</title><style>
body{font-family:system-ui,Arial,sans-serif;color:#0f172a;max-width:820px;margin:2rem auto;padding:0 1rem}
h1{font-size:20px} h2{font-size:14px;margin-top:1.5rem;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:12px;margin-top:.5rem}
th,td{border:1px solid #e2e8f0;padding:4px 8px;text-align:left} th{background:#f8fafc}
.muted{color:#64748b;font-size:12px} @media print{body{margin:0}}
</style></head><body>
<h1>OHCS IIE — ${cap(d.meta.period)} report</h1>
<p class="muted">${d.meta.start.slice(0, 10)} to ${d.meta.end.slice(0, 10)} · generated ${d.meta.generated_at}</p>
<h2>Executive summary</h2>
${tbl(["Metric", "Value"], [["Employees", d.summary.employees], ["Events in period", d.summary.events], ["Leave submitted", d.summary.leave_submitted], ["Leave completed", d.summary.leave_completed], ["Avg leave cycle (days)", d.summary.avg_leave_cycle_days ?? "—"], ["Late rate", pct(d.summary.late_rate)]])}
<h2>Attendance by department</h2>
${tbl(["Department", "Clock-ins", "Late", "Late rate"], d.attendance.by_department.map((x) => [x.department, x.clock_ins, x.late, pct(x.late_rate)]))}
<h2>Leave</h2>
${tbl(["Type", "Count"], d.leave.by_type.map((x) => [x.type, x.count]))}
<h2>Process intelligence</h2>
${tbl(["Metric", "Value"], [["Flagged bottlenecks", d.process.flagged_bottlenecks], ["Top bottleneck", d.process.top_bottleneck ?? "—"], ["Conformance rate", pct(d.process.conformance_rate)], ["Workflow variants", d.process.variant_count]])}
<h2>Recommendations</h2>
${d.recommendations.length ? tbl(["Severity", "Title", "Detail"], d.recommendations.map((r) => [r.severity, r.title, r.detail])) : '<p class="muted">No issues detected.</p>'}
</body></html>`;
}
