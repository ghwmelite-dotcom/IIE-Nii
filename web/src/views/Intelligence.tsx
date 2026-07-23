import { useState } from "react";
import { api } from "../api";
import { usePoll } from "../hooks";
import ProcessMap from "../components/ProcessMap";

const SOURCES = ["LEAVE_WORKFLOW", "ATTENDANCE", "CHATBOT"] as const;

const DAYS = (ms: number) => (ms / 86_400_000).toFixed(1);

export default function Intelligence() {
	const [source, setSource] = useState<(typeof SOURCES)[number]>("LEAVE_WORKFLOW");
	const model = usePoll(() => api.processMap(source), 30_000, [source]);
	const bottlenecks = usePoll(() => api.bottlenecks(source), 30_000, [source]);
	const conformance = usePoll(api.conformance, 30_000);

	const m = model.data?.models[0];
	const flaggedPairs = new Set((bottlenecks.data?.bottlenecks ?? []).filter((b) => b.flagged).map((b) => b.activity_pair));

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
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
				{m && (
					<span className="ml-auto text-xs text-slate-400">
						{m.case_count} cases · {m.event_count} events · mined {new Date(m.created_at).toLocaleString()}
					</span>
				)}
			</div>

			{/* Process map */}
			<section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="mb-2 text-sm font-semibold text-slate-700">Discovered process map</h2>
				{m ? <ProcessMap nodes={m.graph.nodes} edges={m.graph.edges} flaggedPairs={flaggedPairs} /> : <p className="text-slate-400">Loading…</p>}
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Bottlenecks */}
				<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-3 text-sm font-semibold text-slate-700">Bottlenecks</h2>
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wide text-slate-400">
								<th className="pb-2">Transition</th>
								<th className="pb-2 text-right">n</th>
								<th className="pb-2 text-right">Median</th>
								<th className="pb-2 text-right">P95</th>
							</tr>
						</thead>
						<tbody>
							{(bottlenecks.data?.bottlenecks ?? []).map((b) => (
								<tr key={b.id} className={b.flagged ? "bg-red-50 font-medium text-red-900" : "text-slate-600"}>
									<td className="py-1 pr-2">{b.activity_pair}</td>
									<td className="py-1 text-right">{b.count}</td>
									<td className="py-1 text-right">{DAYS(b.median_ms)}d</td>
									<td className="py-1 text-right">{DAYS(b.p95_ms)}d</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>

				{/* Variants + conformance */}
				<div className="space-y-6">
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">Workflow variants</h2>
						<ul className="space-y-1 text-sm">
							{(m?.variants ?? []).map((v, i) => (
								<li key={i} className="flex items-start gap-2">
									<span className="w-10 shrink-0 text-right font-medium">{v.count}×</span>
									<span className="text-slate-600">{v.activities.join(" → ")}</span>
								</li>
							))}
						</ul>
					</section>

					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">Conformance</h2>
						{conformance.data ? (
							<>
								<div className="mb-2 flex gap-3 text-sm">
									<span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">{conformance.data.summary.deviations} deviations</span>
									{conformance.data.summary.avg_score !== null && (
										<span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">avg score {conformance.data.summary.avg_score}</span>
									)}
								</div>
								<ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
									{conformance.data.deviations.map((d) => (
										<li key={d.id}>
											<span className="font-mono">{d.case_id.slice(0, 8)}</span> — {d.description} ({d.score})
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
		</div>
	);
}
