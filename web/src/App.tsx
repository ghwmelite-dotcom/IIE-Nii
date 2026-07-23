import { useState } from "react";
import Operations from "./views/Operations";
import Intelligence from "./views/Intelligence";
import DecisionSupport from "./views/DecisionSupport";
import ChatWidget from "./components/ChatWidget";

const TABS = [
	{ id: "operations", label: "Operations" },
	{ id: "intelligence", label: "Process Intelligence" },
	{ id: "decision", label: "Decision Support" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function App() {
	const [tab, setTab] = useState<Tab>("operations");

	return (
		<div className="min-h-screen bg-slate-100 text-slate-900">
			<header className="bg-slate-900 text-white">
				<div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 pt-4">
					<h1 className="text-lg font-semibold">Intelligent Integration Engine</h1>
					<span className="text-sm text-slate-400">OHCS · Process Intelligence Platform</span>
				</div>
				<nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-0 pt-3">
					{TABS.map((t) => (
						<button
							key={t.id}
							onClick={() => setTab(t.id)}
							className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
								tab === t.id ? "bg-slate-100 text-slate-900" : "text-slate-300 hover:bg-slate-800 hover:text-white"
							}`}
						>
							{t.label}
						</button>
					))}
				</nav>
			</header>

			<main className="mx-auto max-w-6xl px-4 py-6">
				{tab === "operations" && <Operations />}
				{tab === "intelligence" && <Intelligence />}
				{tab === "decision" && <DecisionSupport />}
			</main>

			<ChatWidget />
		</div>
	);
}
