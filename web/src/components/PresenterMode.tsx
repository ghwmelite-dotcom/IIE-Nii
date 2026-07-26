import { useEffect, useState } from "react";
import { PRESENTER_SCRIPT } from "../presenter/script";

const STORAGE_KEY = "iie-presenter-step";

function initialIndex(): number {
	const saved = Number(window.localStorage.getItem(STORAGE_KEY));
	return Number.isInteger(saved) && saved >= 0 && saved < PRESENTER_SCRIPT.length ? saved : 0;
}

export default function PresenterMode({ open, onClose }: { open: boolean; onClose: () => void }) {
	const [index, setIndex] = useState(initialIndex);
	const [collapsed, setCollapsed] = useState(false);
	const step = PRESENTER_SCRIPT[index];
	const actSteps = PRESENTER_SCRIPT.filter((s) => s.act === step.act);
	const actStepNo = actSteps.indexOf(step) + 1;

	// Persist position and navigate the app to the step's tab.
	useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, String(index));
		const target = PRESENTER_SCRIPT[index].tab;
		if (open && target && window.location.hash !== `#${target}`) {
			window.location.hash = target;
		}
	}, [open, index]);

	if (!open) return null;

	const go = (delta: number) =>
		setIndex((i) => Math.min(PRESENTER_SCRIPT.length - 1, Math.max(0, i + delta)));

	return (
		<div className="fixed bottom-4 left-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-indigo-200 bg-white/95 shadow-2xl shadow-indigo-950/25 backdrop-blur">
			<div className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-white">
				<span className="text-[11px] font-semibold uppercase tracking-wider opacity-90">{step.act}</span>
				<span className="ml-auto text-[11px] font-medium opacity-90">
					{index + 1} / {PRESENTER_SCRIPT.length}
				</span>
				<button
					onClick={() => setCollapsed((c) => !c)}
					className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/15"
					title={collapsed ? "Expand" : "Collapse"}
				>
					{collapsed ? "▲" : "▼"}
				</button>
				<button onClick={onClose} className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/15" title="Close Presenter Mode">
					✕
				</button>
			</div>

			{collapsed ? (
				<div className="flex items-center gap-2 px-3 py-2">
					<span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{step.title}</span>
					<NavButtons index={index} go={go} />
				</div>
			) : (
				<div className="space-y-2.5 px-3 py-3">
					<h3 className="text-sm font-semibold text-slate-900">
						{step.title}
						<span className="ml-2 text-[11px] font-normal text-slate-400">
							step {actStepNo} of {actSteps.length}
						</span>
					</h3>
					<p className="text-xs leading-relaxed text-slate-700">
						<span className="font-semibold text-indigo-600">Do: </span>
						{step.click}
					</p>
					<blockquote className="rounded-lg border-l-4 border-indigo-400 bg-indigo-50 px-3 py-2 text-xs italic leading-relaxed text-slate-800">
						“{step.say}”
					</blockquote>
					{step.expect && (
						<p className="inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
							Expect: {step.expect}
						</p>
					)}
					{step.terminal && (
						<code className="block rounded-lg bg-slate-900 px-3 py-2 font-mono text-[11px] text-emerald-300">{step.terminal}</code>
					)}
					<div className="flex items-center justify-between pt-1">
						<button
							onClick={() => setIndex(0)}
							className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
						>
							Restart
						</button>
						<NavButtons index={index} go={go} />
					</div>
				</div>
			)}
		</div>
	);
}

function NavButtons({ index, go }: { index: number; go: (delta: number) => void }) {
	return (
		<div className="flex gap-1.5">
			<button
				onClick={() => go(-1)}
				disabled={index === 0}
				className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
			>
				← Prev
			</button>
			<button
				onClick={() => go(1)}
				disabled={index === PRESENTER_SCRIPT.length - 1}
				className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
			>
				Next →
			</button>
		</div>
	);
}
