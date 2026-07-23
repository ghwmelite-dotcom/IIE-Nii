import { api } from "../api";
import { usePoll } from "../hooks";

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
	const recs = usePoll(api.recommendations, 30_000);
	const departments = usePoll(api.departmentInsights, 30_000);

	const sorted = [...(recs.data?.recommendations ?? [])].sort(
		(a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
	);
	const [top, ...rest] = sorted;

	const depts = departments.data?.departments ?? [];
	const avgLate = depts.length ? depts.reduce((a, d) => a + d.late_rate, 0) / depts.length : 0;
	const avgLeave = depts.length ? depts.reduce((a, d) => a + (d.avg_leave_days ?? 0), 0) / depts.length : 0;

	return (
		<div className="space-y-6">
			<p className="text-sm text-slate-500">
				Rule-generated from the latest bottleneck, conformance, and variant analysis
				{recs.data ? ` (${new Date(recs.data.generated_at).toLocaleString()})` : ""}. The AI narrative layer arrives in a later phase.
			</p>

			{/* Top insight banner */}
			{top && (
				<div className="rounded-xl bg-slate-900 p-5 text-white shadow-md">
					<div className="mb-1 flex items-center gap-2">
						<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_BADGE[top.severity]}`}>{top.severity}</span>
						<span className="text-[10px] uppercase tracking-wide text-slate-400">Top insight · {top.kind}</span>
					</div>
					<h3 className="text-lg font-bold">{top.title}</h3>
					<p className="mt-1 text-sm text-slate-300">{top.detail}</p>
				</div>
			)}

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

			{/* Remaining recommendations */}
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

			{sorted.length === 0 && recs.data && (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800">
					No issues detected in the latest mining run — processes look healthy.
				</div>
			)}
		</div>
	);
}
