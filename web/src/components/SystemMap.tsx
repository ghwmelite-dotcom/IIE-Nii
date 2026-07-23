import type { Overview } from "../api";

const SUBSYSTEMS = [
	{
		source: "CHATBOT",
		name: "AI Chatbot",
		tagline: "Workers AI + RAG",
		accent: "border-amber-400",
		text: "text-amber-700",
		bg: "bg-amber-50",
	},
	{
		source: "ATTENDANCE",
		name: "Attendance",
		tagline: "RFID webhook intake",
		accent: "border-emerald-400",
		text: "text-emerald-700",
		bg: "bg-emerald-50",
	},
	{
		source: "LEAVE_WORKFLOW",
		name: "Leave Workflow",
		tagline: "State machine",
		accent: "border-indigo-400",
		text: "text-indigo-700",
		bg: "bg-indigo-50",
	},
] as const;

function Arrow() {
	return (
		<div className="flex items-center justify-center text-slate-400" aria-hidden>
			<svg className="h-8 w-8 rotate-90 lg:rotate-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
				<path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		</div>
	);
}

/** Live system map: subsystems → Integration Engine → Process Intelligence. */
export default function SystemMap({ overview }: { overview: Overview | null }) {
	const counts = new Map((overview?.sources ?? []).map((s) => [s.source, s]));

	return (
		<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 className="mb-1 text-sm font-semibold text-slate-700">System map</h2>
			<p className="mb-4 text-xs text-slate-400">
				Every subsystem emits standardized events into one unified log — the engine mines it for intelligence.
			</p>

			<div className="grid items-stretch gap-2 lg:grid-cols-[1.2fr_auto_1.3fr_auto_1.2fr]">
				{/* Subsystems */}
				<div className="flex flex-col justify-center gap-2">
					{SUBSYSTEMS.map((s) => {
						const c = counts.get(s.source);
						return (
							<div key={s.source} className={`flex items-center justify-between rounded-lg border-l-4 ${s.accent} ${s.bg} px-3 py-2`}>
								<div>
									<div className="text-sm font-semibold">{s.name}</div>
									<div className="text-[10px] uppercase tracking-wide text-slate-500">{s.tagline}</div>
								</div>
								<div className="text-right">
									<div className={`text-sm font-bold ${s.text}`}>{c ? c.today : "…"}</div>
									<div className="text-[10px] text-slate-500">today · {c ? c.total.toLocaleString() : "…"} total</div>
								</div>
							</div>
						);
					})}
				</div>

				<Arrow />

				{/* Engine hub */}
				<div className="flex flex-col justify-center rounded-lg bg-slate-900 px-4 py-3 text-white">
					<div className="text-sm font-semibold">Integration Engine</div>
					<div className="text-[10px] uppercase tracking-wide text-slate-400">Ingest · Normalize · Route</div>
					<div className="mt-2 text-2xl font-bold">{overview ? overview.events_total.toLocaleString() : "…"}</div>
					<div className="text-[10px] text-slate-400">events in the Unified Event Log · {overview?.events_today ?? "…"} today</div>
				</div>

				<Arrow />

				{/* Intelligence */}
				<div className="flex flex-col justify-center rounded-lg border border-violet-300 bg-violet-50 px-4 py-3">
					<div className="text-sm font-semibold text-violet-900">Process Intelligence</div>
					<div className="text-[10px] uppercase tracking-wide text-violet-500">Mine · Detect · Conform · Recommend</div>
					<div className="mt-2 text-2xl font-bold text-violet-900">{overview?.flagged_bottlenecks ?? "…"}</div>
					<div className="text-[10px] text-violet-600">
						flagged bottlenecks · last run {overview?.last_mining_run ? new Date(overview.last_mining_run).toLocaleTimeString() : "…"}
					</div>
				</div>
			</div>
		</section>
	);
}
