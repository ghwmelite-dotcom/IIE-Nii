import { useEffect, useState } from "react";
import { api } from "../api";
import type { CaseTrace as Trace } from "../api";

interface Props {
	caseId: string;
	onClose: () => void;
}

const TERMINAL = new Set(["completed", "rejected", "cancelled"]);

/** Modal showing a case's full chronological event trace (GET /api/events?case_id=). */
export default function CaseTrace({ caseId, onClose }: Props) {
	const [trace, setTrace] = useState<Trace | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api
			.caseTrace(caseId)
			.then(setTrace)
			.catch((e) => setError(e instanceof Error ? e.message : String(e)));
	}, [caseId]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
			<div
				className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
					<h3 className="font-mono text-sm font-semibold">{caseId}</h3>
					{trace && <span className="text-xs text-slate-400">{trace.count} events</span>}
					<button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700" aria-label="Close">
						✕
					</button>
				</div>
				<div className="overflow-y-auto p-4">
					{error && <p className="text-sm text-red-700">Couldn't load trace — {error}</p>}
					{!trace && !error && <p className="text-sm text-slate-400">Loading…</p>}
					{trace && trace.events.length === 0 && <p className="text-sm text-slate-400">No events for this case.</p>}
					{trace && (
						<ol className="relative space-y-3 border-l border-slate-200 pl-4">
							{trace.events.map((e) => (
								<li key={e.event_id}>
									<span
										className={`absolute -ml-[21px] mt-1.5 h-2.5 w-2.5 rounded-full ${
											TERMINAL.has(e.activity) ? "bg-emerald-500" : "bg-indigo-400"
										}`}
									/>
									<div className="flex items-baseline justify-between gap-2">
										<span className="text-sm font-medium">{e.activity}</span>
										<span className="shrink-0 text-xs text-slate-400">{e.timestamp.replace("T", " ").slice(0, 19)}</span>
									</div>
									<div className="text-xs text-slate-500">
										{e.resource} · {e.source_system}
										{typeof e.metadata.decision === "string" && ` · ${e.metadata.decision}`}
										{typeof e.metadata.reason === "string" && ` — ${e.metadata.reason}`}
									</div>
								</li>
							))}
						</ol>
					)}
				</div>
			</div>
		</div>
	);
}
