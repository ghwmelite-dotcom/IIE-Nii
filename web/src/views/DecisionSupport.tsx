import { useState, useEffect } from "react";
import { api } from "../api";
import type { ReportData } from "../api";
import { usePoll } from "../hooks";
import LoadError from "../components/LoadError";
import { useAuth, can } from "../auth/AuthContext";

const SEVERITY_STYLES: Record<string, string> = {
	high: "border-l-red-500",
	medium: "border-l-amber-500",
	low: "border-l-slate-400",
};

const SEVERITY_BADGE: Record<string, string> = {
	high: "bg-red-600 text-white",
	medium: "bg-amber-500 text-white",
	low: "bg-slate-400 text-white",
};

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Fixed, meaningful scales — bars only shout when a value is truly out of line.
const LATE_RATE_SCALE = 0.25;
const LEAVE_DAYS_SCALE = 10;

export default function DecisionSupport() {
	const { me } = useAuth();
	const canIntel = me ? can(me, "intelligence.read") : false;

	const recs = usePoll(api.recommendations, 30_000, [], canIntel);
	const departments = usePoll(api.departmentInsights, 30_000);
	const bottlenecks = usePoll(api.bottlenecks, 30_000, [], canIntel);

	const [period, setPeriod] = useState<"weekly" | "monthly" | "yearly">("monthly");
	const [report, setReport] = useState<ReportData | null>(null);
	const [reportErr, setReportErr] = useState<string | null>(null);
	useEffect(() => {
		setReport(null);
		setReportErr(null);
		api.report(period).then(setReport).catch((e) => setReportErr(String(e)));
	}, [period]);

	const sorted = [...(recs.data?.recommendations ?? [])].sort(
		(a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
	);
	const [top, ...rest] = sorted;

	const depts = departments.data?.departments ?? [];
	const avgLate = depts.length ? depts.reduce((a, d) => a + d.late_rate, 0) / depts.length : 0;
	const avgLeave = depts.length ? depts.reduce((a, d) => a + (d.avg_leave_days ?? 0), 0) / depts.length : 0;

	function downloadCsv() {
		const csvCell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
		const section = (title: string, rows: unknown[][]) => `${title}\n${rows.map((r) => r.map(csvCell).join(",")).join("\n")}`;
		const csv = [
			section("Recommendations", [["kind", "severity", "title", "detail"], ...sorted.map((r) => [r.kind, r.severity, r.title, r.detail])]),
			section(
				"Department comparison",
				[
					["department", "clock_ins", "late_rate", "leave_cases", "avg_leave_days"],
					...depts.map((d) => [d.department, d.clock_ins, d.late_rate, d.leave_cases, d.avg_leave_days ?? ""]),
				],
			),
		].join("\n\n");
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
		const a = Object.assign(document.createElement("a"), {
			href: url,
			download: `decision-support-${new Date().toISOString().slice(0, 10)}.csv`,
		});
		a.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div className="space-y-6">
			{canIntel && <LoadError label="recommendations" error={recs.error && !recs.data ? recs.error : null} />}
			<LoadError label="department insights" error={departments.error && !departments.data ? departments.error : null} />

			{/* Bottlenecks — rendered at the very top, only for intelligence users */}
			{canIntel && (() => {
				const flagged = (bottlenecks.data?.bottlenecks ?? []).filter((b) => b.flagged);
				const DAY = 86_400_000;
				return flagged.length > 0 ? (
					<section className="rounded-xl border border-red-200 bg-red-50/60 p-4 shadow-sm">
						<h2 className="mb-1 text-sm font-semibold text-red-800">Bottlenecks — slowest hand-offs</h2>
						<p className="mb-3 text-xs text-red-700/70">Steps exceeding their SLA threshold, ranked by 95th-percentile wait.</p>
						<div className="space-y-2">
							{flagged.sort((a, b) => b.p95_ms - a.p95_ms).map((b) => (
								<div key={b.id} className="flex items-center gap-3 rounded-lg border border-red-200 bg-white p-3 text-sm">
									<span className="font-medium">{b.activity_pair.replaceAll("_", " ")}</span>
									<span className="text-xs text-slate-400">{b.source.toLowerCase().replace("_", " ")}</span>
									<span className="ml-auto text-xs text-slate-600">median {(b.median_ms / DAY).toFixed(1)}d · P95 {(b.p95_ms / DAY).toFixed(1)}d · {b.count} cases</span>
								</div>
							))}
						</div>
					</section>
				) : null;
			})()}

			<div className="flex flex-wrap items-start gap-3">
				<p className="flex-1 text-sm text-slate-500">
					Rule-generated from the latest bottleneck, conformance, and variant analysis
					{recs.data ? ` (${new Date(recs.data.generated_at).toLocaleString()})` : ""}. The AI narrative layer arrives in a later phase.
				</p>
				<div className="no-print flex gap-2">
					<button
						onClick={downloadCsv}
						disabled={!departments.data}
						className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
					>
						Download CSV
					</button>
					<button
						onClick={() => window.print()}
						className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
					>
						Print / Save as PDF
					</button>
				</div>
			</div>

			{/* Top insight banner — only for intelligence users */}
			{canIntel && top && (
				<div className="rounded-xl bg-slate-900 p-5 text-white shadow-md">
					<div className="mb-1 flex items-center gap-2">
						<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_BADGE[top.severity]}`}>{top.severity}</span>
						<span className="text-[10px] uppercase tracking-wide text-slate-400">Top insight · {top.kind}</span>
					</div>
					<h3 className="text-lg font-bold">{top.title}</h3>
					<p className="mt-1 text-sm text-slate-300">{top.detail}</p>
				</div>
			)}

			{/* Reports section */}
			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold text-slate-700">Reports</h2>
					<select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
						<option value="weekly">Weekly</option>
						<option value="monthly">Monthly</option>
						<option value="yearly">Yearly</option>
					</select>
					<div className="ml-auto flex gap-2">
						<a href={api.reportCsvUrl(period)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Download CSV</a>
						<button onClick={() => window.open(api.reportHtmlUrl(period), "_blank")} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Open printable report</button>
					</div>
				</div>
				{reportErr && <p className="text-xs text-red-700">{reportErr}</p>}
				{report && (
					<div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
						{[
							["Employees", report.summary.employees],
							["Events", report.summary.events],
							["Leave submitted", report.summary.leave_submitted],
							["Leave completed", report.summary.leave_completed],
							["Avg leave cycle", report.summary.avg_leave_cycle_days != null ? `${report.summary.avg_leave_cycle_days.toFixed(1)}d` : "—"],
							["Late rate", `${Math.round(report.summary.late_rate * 100)}%`],
							["Flagged bottlenecks", report.process.flagged_bottlenecks],
							["Conformance", report.process.conformance_rate != null ? `${Math.round(report.process.conformance_rate * 100)}%` : "—"],
						].map(([label, value]) => (
							<div key={String(label)} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
								<div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
								<div className="text-lg font-semibold">{value}</div>
							</div>
						))}
					</div>
				)}
				<p className="mt-2 text-[11px] text-slate-400">Windows are rolling (last 7 / 30 / 365 days). Scheduled reports are archived and pushed to Telegram automatically.</p>
			</section>

			{/* Department comparison */}
			{depts.length > 0 && (
				<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-1 text-sm font-semibold text-slate-700">Department comparison</h2>
					<p className="mb-4 text-xs text-slate-400">
						Late arrivals (scale 0–25%) and leave-approval cycle (scale 0–10d). Red marks &gt;1.5× the office average.
					</p>
					<div className="space-y-4">
						{depts.map((d) => {
							const lateOutlier = d.late_rate > 1.5 * avgLate;
							const leaveOutlier = (d.avg_leave_days ?? 0) > 1.5 * avgLeave;
							return (
								<div key={d.department} className="grid grid-cols-[9rem_1fr_1fr] items-center gap-4 text-sm max-md:grid-cols-1">
									<div className="font-medium">{d.department}</div>
									<div className="flex items-center gap-2">
										<div className="h-2.5 flex-1 rounded-full bg-slate-100">
											<div
												className={`h-full rounded-full ${lateOutlier ? "bg-red-500" : "bg-emerald-500"}`}
												style={{ width: `${Math.min(100, (d.late_rate / LATE_RATE_SCALE) * 100)}%` }}
											/>
										</div>
										<span className={`w-12 text-right text-xs ${lateOutlier ? "font-bold text-red-700" : "text-slate-600"}`}>
											{Math.round(d.late_rate * 100)}%
										</span>
									</div>
									<div className="flex items-center gap-2">
										<div className="h-2.5 flex-1 rounded-full bg-slate-100">
											<div
												className={`h-full rounded-full ${leaveOutlier ? "bg-red-500" : "bg-indigo-500"}`}
												style={{ width: `${Math.min(100, ((d.avg_leave_days ?? 0) / LEAVE_DAYS_SCALE) * 100)}%` }}
											/>
										</div>
										<span className={`w-12 text-right text-xs ${leaveOutlier ? "font-bold text-red-700" : "text-slate-600"}`}>
											{d.avg_leave_days ?? "—"}d
										</span>
									</div>
								</div>
							);
						})}
					</div>
					<div className="mt-3 flex gap-4 text-[11px] text-slate-400">
						<span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> late arrivals</span>
						<span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500" /> leave cycle</span>
					</div>
				</section>
			)}

			{/* Remaining recommendations — only for intelligence users */}
			{canIntel && (
				<div className="grid gap-4 md:grid-cols-2">
					{rest.map((r, i) => (
						<div key={i} className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${SEVERITY_STYLES[r.severity]}`}>
							<div className="mb-2 flex items-center gap-2">
								<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_BADGE[r.severity]}`}>{r.severity}</span>
								<span className="text-[10px] uppercase tracking-wide text-slate-500">{r.kind}</span>
							</div>
							<h3 className="font-semibold">{r.title}</h3>
							<p className="mt-1 text-sm text-slate-600">{r.detail}</p>
						</div>
					))}
				</div>
			)}

			{canIntel && sorted.length === 0 && recs.data && (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800">
					No issues detected in the latest mining run — processes look healthy.
				</div>
			)}
		</div>
	);
}
