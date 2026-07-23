import { api } from "../api";
import { usePoll } from "../hooks";

const SEVERITY_STYLES: Record<string, string> = {
	high: "border-red-300 bg-red-50",
	medium: "border-amber-300 bg-amber-50",
	low: "border-slate-200 bg-white",
};

const SEVERITY_BADGE: Record<string, string> = {
	high: "bg-red-600 text-white",
	medium: "bg-amber-500 text-white",
	low: "bg-slate-400 text-white",
};

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function DecisionSupport() {
	const recs = usePoll(api.recommendations, 30_000);
	const departments = usePoll(api.departmentInsights, 30_000);

	const sorted = [...(recs.data?.recommendations ?? [])].sort(
		(a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
	);
	const [top, ...rest] = sorted;

	const depts = departments.data?.departments ?? [];
	const maxLateRate = Math.max(0.01, ...depts.map((d) => d.late_rate));
	const maxLeaveDays = Math.max(1, ...depts.map((d) => d.avg_leave_days ?? 0));

	return (
		<div className="space-y-6">
			<p className="text-sm text-slate-500">
				Rule-generated from the latest bottleneck, conformance, and variant analysis
				{recs.data ? ` (${new Date(recs.data.generated_at).toLocaleString()})` : ""}. The AI narrative layer arrives in a later phase.
			</p>

			{/* Top insight banner */}
			{top && (
				<div className={`rounded-xl border-2 p-5 shadow-sm ${SEVERITY_STYLES[top.severity]}`}>
					<div className="mb-1 flex items-center gap-2">
						<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_BADGE[top.severity]}`}>{top.severity}</span>
						<span className="text-[10px] uppercase tracking-wide text-slate-500">Top insight · {top.kind}</span>
					</div>
					<h3 className="text-lg font-bold">{top.title}</h3>
					<p className="mt-1 text-sm text-slate-700">{top.detail}</p>
				</div>
			)}

			{/* Department comparison */}
			{depts.length > 0 && (
				<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-1 text-sm font-semibold text-slate-700">Department comparison</h2>
					<p className="mb-4 text-xs text-slate-400">Late-arrival rate and average leave-approval cycle, per department.</p>
					<div className="space-y-3">
						{depts.map((d) => (
							<div key={d.department} className="grid grid-cols-[9rem_1fr_1fr] items-center gap-3 text-sm max-md:grid-cols-1">
								<div className="font-medium">{d.department}</div>
								<div>
									<div className="mb-0.5 flex justify-between text-xs text-slate-500">
										<span>Late arrivals</span>
										<span className={d.late_rate / maxLateRate > 0.8 ? "font-semibold text-red-700" : ""}>
											{Math.round(d.late_rate * 100)}%
										</span>
									</div>
									<div className="h-2 rounded-full bg-slate-100">
										<div
											className={`h-full rounded-full ${d.late_rate / maxLateRate > 0.8 ? "bg-red-500" : "bg-emerald-500"}`}
											style={{ width: `${(d.late_rate / maxLateRate) * 100}%` }}
										/>
									</div>
								</div>
								<div>
									<div className="mb-0.5 flex justify-between text-xs text-slate-500">
										<span>Leave cycle ({d.leave_cases} cases)</span>
										<span className="font-semibold">{d.avg_leave_days ?? "—"}d</span>
									</div>
									<div className="h-2 rounded-full bg-slate-100">
										<div className="h-full rounded-full bg-indigo-500" style={{ width: `${((d.avg_leave_days ?? 0) / maxLeaveDays) * 100}%` }} />
									</div>
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Remaining recommendations */}
			<div className="grid gap-4 md:grid-cols-2">
				{rest.map((r, i) => (
					<div key={i} className={`rounded-xl border p-4 shadow-sm ${SEVERITY_STYLES[r.severity]}`}>
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
