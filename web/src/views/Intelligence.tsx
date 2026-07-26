import { useState } from "react";
import { api } from "../api";
import { usePoll } from "../hooks";
import ProcessMap from "../components/ProcessMap";
import LoadError from "../components/LoadError";
import CaseTrace from "../components/CaseTrace";
import type { EdgeStat } from "../components/ProcessMap";

const SOURCES = ["LEAVE_WORKFLOW", "ATTENDANCE", "CHATBOT"] as const;

const DAYS = (ms: number) => (ms / 86_400_000).toFixed(1);

const VARIANT_COLORS = ["#4f46e5", "#059669", "#d97706", "#e11d48", "#64748b", "#0891b2"];

export default function Intelligence() {
	const [source, setSource] = useState<(typeof SOURCES)[number]>("LEAVE_WORKFLOW");
	const [traceCase, setTraceCase] = useState<string | null>(null);
	const model = usePoll(() => api.processMap(source), 30_000, [source]);
	const bottlenecks = usePoll(() => api.bottlenecks(source), 30_000, [source]);
	const conformance = usePoll(api.conformance, 30_000);

	const m = model.data?.models[0];
	const edgeStats = new Map<string, EdgeStat>(
		(bottlenecks.data?.bottlenecks ?? []).map((b) => [b.activity_pair, { median_ms: b.median_ms, flagged: b.flagged }]),
	);
	const flaggedCount = (bottlenecks.data?.bottlenecks ?? []).filter((b) => b.flagged).length;

	const variantTotal = (m?.variants ?? []).reduce((acc, v) => acc + v.count, 0);
	const deviating = conformance.data?.summary.deviations ?? 0;
	const conformantRate = m && m.case_count > 0 ? Math.max(0, Math.round(((m.case_count - deviating) / m.case_count) * 100)) : null;

	return (
		<div className="space-y-6">
			<LoadError label="process model" error={model.error && !model.data ? model.error : null} />
			<LoadError label="bottlenecks" error={bottlenecks.error && !bottlenecks.data ? bottlenecks.error : null} />
			<LoadError label="conformance" error={conformance.error && !conformance.data ? conformance.error : null} />
			<div className="flex flex-wrap items-center gap-2">
				{SOURCES.map((s) => (
					<button
						key={s}
						onClick={() => setSource(s)}
						className={`rounded-md px-3 py-1.5 text-sm font-medium ${
							source === s ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
						}`}
					>
						{s.toLowerCase().replace("_", " ")}
					</button>
				))}
				<div className="ml-auto flex gap-2 text-xs font-medium">
					<span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-800">{m?.case_count ?? "…"} cases</span>
					<span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">{m?.event_count ?? "…"} events</span>
					<span className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">{m?.variants.length ?? "…"} variants</span>
					<span
						className={`rounded-lg border px-2.5 py-1 ${
							flaggedCount > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-500"
						}`}
					>
						{flaggedCount} flagged
					</span>
				</div>
			</div>

			{/* Process map with duration overlay */}
			<section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="mb-1 text-sm font-semibold text-slate-700">Discovered process map</h2>
				<p className="mb-2 text-xs text-slate-400">Pills show cases · median transition time. Red pills = over SLA threshold.</p>
				{m ? <ProcessMap nodes={m.graph.nodes} edges={m.graph.edges} edgeStats={edgeStats} /> : <p className="text-slate-400">Loading…</p>}
				{m && <p className="mt-2 text-right text-xs text-slate-400">mined {new Date(m.created_at).toLocaleString()}</p>}
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Bottlenecks */}
				<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-1 text-sm font-semibold text-slate-700">Bottlenecks</h2>
					<p className="mb-3 text-xs text-slate-400">Median vs P95 transition time per step — bars scale to the slowest.</p>
					{(() => {
						const rows = bottlenecks.data?.bottlenecks ?? [];
						const maxP95 = Math.max(1, ...rows.map((b) => b.p95_ms));
						return (
							<ul className="space-y-2.5">
								{rows.map((b) => (
									<li key={b.id}>
										<div className="flex items-baseline justify-between text-sm">
											<span className={b.flagged ? "font-semibold text-red-800" : "text-slate-700"}>{b.activity_pair}</span>
											<span className={`text-xs ${b.flagged ? "font-semibold text-red-700" : "text-slate-500"}`}>
												{b.count} · {DAYS(b.median_ms)}d median · {DAYS(b.p95_ms)}d p95
											</span>
										</div>
										<div className="mt-1 flex h-2 w-full gap-0.5">
											<div
												className={`h-full rounded-l-full ${b.flagged ? "bg-red-500" : "bg-slate-400"}`}
												style={{ width: `${(b.median_ms / maxP95) * 100}%` }}
											/>
											<div
												className={`h-full rounded-r-full ${b.flagged ? "bg-red-200" : "bg-slate-200"}`}
												style={{ width: `${((b.p95_ms - b.median_ms) / maxP95) * 100}%` }}
											/>
										</div>
									</li>
								))}
							</ul>
						);
					})()}
				</section>

				<div className="space-y-6">
					{/* Variant share */}
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">Workflow variants</h2>
						{variantTotal > 0 && (
							<div className="mb-3 flex h-4 w-full overflow-hidden rounded-full">
								{(m?.variants ?? []).map((v, i) => (
									<div
										key={i}
										style={{ width: `${(v.count / variantTotal) * 100}%`, backgroundColor: VARIANT_COLORS[i % VARIANT_COLORS.length] }}
										title={`${v.count} cases`}
									/>
								))}
							</div>
						)}
						<ul className="space-y-1 text-sm">
							{(m?.variants ?? []).map((v, i) => (
								<li key={i} className="flex items-start gap-2">
									<span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: VARIANT_COLORS[i % VARIANT_COLORS.length] }} />
									<span className="w-14 shrink-0 text-right font-medium">
										{v.count}× <span className="text-xs text-slate-400">({Math.round((v.count / variantTotal) * 100)}%)</span>
									</span>
									<span className="text-slate-600">{v.activities.join(" → ")}</span>
								</li>
							))}
						</ul>
					</section>

					{/* Conformance */}
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">Conformance</h2>
						{conformance.data ? (
							<>
								{conformantRate !== null && (
									<div className="mb-3">
										<div className="mb-1 flex items-baseline justify-between text-sm">
											<span className="font-semibold">{conformantRate}% of cases follow the prescribed workflow</span>
											<span className="text-xs text-slate-400">{deviating} deviations</span>
										</div>
										<div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
											<div
												className={`h-full rounded-full ${conformantRate >= 90 ? "bg-emerald-500" : conformantRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
												style={{ width: `${conformantRate}%` }}
											/>
										</div>
									</div>
								)}
								<ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-slate-600">
									{conformance.data.deviations.map((d) => (
										<li key={d.id}>
											<button
												onClick={() => setTraceCase(d.case_id)}
												className="font-mono text-indigo-700 underline decoration-dotted hover:text-indigo-900"
												title="View full event trace"
											>
												{d.case_id.slice(0, 12)}
											</button>{" "}
											— {d.description} ({d.score})
										</li>
									))}
								</ul>
							</>
						) : (
							<p className="text-slate-400">Loading…</p>
						)}
					</section>
				</div>
			</div>
			{traceCase && <CaseTrace caseId={traceCase} onClose={() => setTraceCase(null)} />}
		</div>
	);
}
