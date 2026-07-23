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

export default function DecisionSupport() {
	const recs = usePoll(api.recommendations, 30_000);

	return (
		<div className="space-y-4">
			<p className="text-sm text-slate-500">
				Rule-generated from the latest bottleneck, conformance, and variant analysis
				{recs.data ? ` (${new Date(recs.data.generated_at).toLocaleString()})` : ""}. The AI narrative layer arrives in a later phase.
			</p>

			<div className="grid gap-4 md:grid-cols-2">
				{(recs.data?.recommendations ?? []).map((r, i) => (
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

			{recs.data?.recommendations.length === 0 && (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800">
					No issues detected in the latest mining run — processes look healthy.
				</div>
			)}
		</div>
	);
}
