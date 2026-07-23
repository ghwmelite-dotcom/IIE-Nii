import { useEffect, useState } from "react";
import Operations from "./views/Operations";
import Intelligence from "./views/Intelligence";
import DecisionSupport from "./views/DecisionSupport";
import MyLeave from "./views/MyLeave";
import ChatWidget from "./components/ChatWidget";

const ICON_PROPS = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TABS = [
	{
		id: "operations",
		label: "Operations",
		// Activity pulse
		icon: (
			<svg {...ICON_PROPS}>
				<path d="M3 12h4l2.5-7 4 14 2.5-7H21" />
			</svg>
		),
	},
	{
		id: "intelligence",
		label: "Process Intelligence",
		// Process nodes
		icon: (
			<svg {...ICON_PROPS}>
				<circle cx="5.5" cy="6" r="2.2" />
				<circle cx="18.5" cy="6" r="2.2" />
				<circle cx="12" cy="18" r="2.2" />
				<path d="M7.5 7.4 10.3 16M16.5 7.4 13.7 16M7.7 6h8.6" strokeWidth={1.5} />
			</svg>
		),
	},
	{
		id: "decision",
		label: "Decision Support",
		// Compass
		icon: (
			<svg {...ICON_PROPS}>
				<circle cx="12" cy="12" r="9" strokeWidth={1.5} />
				<path d="m15.5 8.5-2 5-5 2 2-5z" />
			</svg>
		),
	},
	{
		id: "leave",
		label: "My Leave",
		// Calendar
		icon: (
			<svg {...ICON_PROPS}>
				<rect x="3.5" y="5" width="17" height="16" rx="2" strokeWidth={1.5} />
				<path d="M3.5 10h17M8 3v4M16 3v4" strokeWidth={1.5} />
			</svg>
		),
	},
] as const;

type Tab = (typeof TABS)[number]["id"];

const tabFromHash = (): Tab => {
	const id = window.location.hash.slice(1);
	return (TABS.some((t) => t.id === id) ? id : "operations") as Tab;
};

export default function App() {
	const [tab, setTab] = useState<Tab>(tabFromHash);

	useEffect(() => {
		const onHash = () => setTab(tabFromHash());
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	const select = (id: Tab) => {
		window.location.hash = id;
		setTab(id);
	};

	return (
		<div className="min-h-screen bg-slate-100 text-slate-900">
			<header className="text-white">
				{/* Ghana tricolor hairline */}
				<div className="flex h-[3px]">
					<div className="flex-1 bg-[#CE1126]" />
					<div className="flex-1 bg-[#FCD116]" />
					<div className="flex-1 bg-[#006B3F]" />
				</div>
				<div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 shadow-lg shadow-slate-900/20">
					<div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-4">
						{/* Brand mark: mined-process glyph */}
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-950/60 ring-1 ring-white/20">
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
								<circle cx="5.5" cy="6" r="2.2" />
								<circle cx="18.5" cy="6" r="2.2" />
								<circle cx="12" cy="18" r="2.2" />
								<path d="M7.5 7.4 10.3 16M16.5 7.4 13.7 16M7.7 6h8.6" strokeWidth="1.4" />
							</svg>
						</div>
						<div>
							<h1 className="text-lg font-semibold leading-tight tracking-tight">Intelligent Integration Engine</h1>
							<p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-slate-400">OHCS · Process Intelligence Platform</p>
						</div>
						<div className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300 backdrop-blur">
							<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
							Live
						</div>
					</div>
					<nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-0 pt-3">
						{TABS.map((t) => (
							<button
								key={t.id}
								onClick={() => select(t.id)}
								className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-all duration-150 ${
									tab === t.id
										? "bg-slate-100 text-slate-900 shadow-[0_-2px_8px_rgba(0,0,0,0.15)]"
										: "text-slate-400 hover:bg-white/5 hover:text-white"
								}`}
							>
								<span className={tab === t.id ? "text-indigo-600" : "text-slate-500"}>{t.icon}</span>
								{t.label}
							</button>
						))}
					</nav>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-4 py-6">
				{tab === "operations" && <Operations />}
				{tab === "intelligence" && <Intelligence />}
				{tab === "decision" && <DecisionSupport />}
				{tab === "leave" && <MyLeave />}
			</main>

			<ChatWidget />
		</div>
	);
}
