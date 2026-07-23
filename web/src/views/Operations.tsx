import { api } from "../api";
import { usePoll } from "../hooks";
import SystemMap from "../components/SystemMap";

const SOURCE_BADGE: Record<string, string> = {
	ATTENDANCE: "bg-emerald-100 text-emerald-800",
	LEAVE_WORKFLOW: "bg-indigo-100 text-indigo-800",
	CHATBOT: "bg-amber-100 text-amber-800",
};

export default function Operations() {
	const overview = usePoll(api.overview, 10_000);
	const feed = usePoll(() => api.recentEvents(25), 5_000);
	const attendance = usePoll(() => api.attendanceDaily(30), 30_000);
	const pipeline = usePoll(api.leavePipeline, 15_000);

	const o = overview.data;
	const stats = [
		{ label: "Employees", value: o?.employees },
		{ label: "Open leave requests", value: o?.leave_open },
	];

	const maxClockIns = Math.max(1, ...(attendance.data?.days.map((d) => d.clock_ins) ?? [1]));
	const stages = pipeline.data?.stages ?? {};

	return (
		<div className="space-y-6">
			<SystemMap overview={o} />

			{/* Stat cards */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
				{stats.map((s) => (
					<div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
						<div className="text-xs text-slate-500">{s.label}</div>
						<div className="mt-1 text-xl font-semibold">{s.value ?? "…"}</div>
					</div>
				))}
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Live event feed */}
				<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-3 text-sm font-semibold text-slate-700">Live event feed</h2>
					<ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
						{(feed.data?.events ?? []).map((e) => (
							<li key={e.event_id} className="flex items-center gap-2 border-b border-slate-100 py-1">
								<span className="w-16 shrink-0 text-xs text-slate-400">{e.timestamp.slice(11, 19)}</span>
								<span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[e.source_system] ?? "bg-slate-100"}`}>
									{e.source_system.replace("_WORKFLOW", "")}
								</span>
								<span className="truncate">
									<span className="font-medium">{e.activity}</span>
									<span className="text-slate-500"> · {e.resource}</span>
								</span>
							</li>
						))}
						{feed.data?.events.length === 0 && <li className="text-slate-400">No events yet.</li>}
					</ul>
				</section>

				<div className="space-y-6">
					{/* Attendance heatmap */}
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">Attendance, last 30 days</h2>
						<div className="grid grid-cols-10 gap-1">
							{(attendance.data?.days ?? []).map((d) => {
								const intensity = d.clock_ins / maxClockIns;
								const lateRatio = d.clock_ins > 0 ? d.late / d.clock_ins : 0;
								return (
									<div
										key={d.date}
										title={`${d.date}: ${d.clock_ins} in, ${d.late} late, ${d.missing_out} missing out`}
										className="flex h-9 items-center justify-center rounded text-[10px] font-medium"
										style={{
											backgroundColor:
												lateRatio > 0.25
													? `rgba(220, 38, 38, ${0.15 + intensity * 0.5})`
													: `rgba(5, 150, 105, ${0.08 + intensity * 0.6})`,
											color: intensity > 0.5 ? "white" : "#334155",
										}}
									>
										{d.date.slice(8)}
									</div>
								);
							})}
						</div>
						<p className="mt-2 text-xs text-slate-400">Green = clock-ins, red tint = &gt;25% late. Hover a cell for detail.</p>
					</section>

					{/* Leave pipeline */}
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">Leave pipeline</h2>
						<div className="flex flex-wrap gap-2">
							{["manager_review", "hr_verification", "director_approval", "completed", "rejected", "escalated"].map((stage) => (
								<div key={stage} className="rounded-lg border border-slate-200 px-3 py-2 text-center">
									<div className="text-lg font-semibold">{stages[stage] ?? 0}</div>
									<div className="text-[10px] uppercase tracking-wide text-slate-500">{stage.replace("_", " ")}</div>
								</div>
							))}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
