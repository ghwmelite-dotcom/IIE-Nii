import { useEffect, useState, type ReactNode } from "react";
import Operations from "./views/Operations";
import Intelligence from "./views/Intelligence";
import DecisionSupport from "./views/DecisionSupport";
import MyLeave from "./views/MyLeave";
import Admin from "./views/Admin";
import Attendance from "./views/Attendance";
import ChatWidget from "./components/ChatWidget";
import { useAuth, can } from "./auth/AuthContext";
import SignIn from "./views/SignIn";

const ICON_PROPS = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

interface TabDef {
	id: string;
	label: string;
	cap: string | null;
	icon: ReactNode;
}

const TABS: TabDef[] = [
	{
		id: "attendance",
		label: "Attendance",
		cap: null,
		// Clock
		icon: (
			<svg {...ICON_PROPS}>
				<circle cx="12" cy="13" r="8" strokeWidth={1.5} />
				<path d="M12 9v4l2.5 1.5" strokeWidth={1.5} />
			</svg>
		),
	},
	{
		id: "operations",
		label: "System Overview",
		cap: null,
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
		cap: "intelligence.read",
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
		cap: "reports.read",
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
		cap: null,
		// Calendar
		icon: (
			<svg {...ICON_PROPS}>
				<rect x="3.5" y="5" width="17" height="16" rx="2" strokeWidth={1.5} />
				<path d="M3.5 10h17M8 3v4M16 3v4" strokeWidth={1.5} />
			</svg>
		),
	},
	{
		id: "admin",
		label: "Administration",
		cap: "admin.users.manage",
		icon: (
			<svg {...ICON_PROPS}>
				<circle cx="12" cy="12" r="3" />
				<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
			</svg>
		),
	},
];

const tabFromHash = (visibleIds: string[]): string => {
	const id = window.location.hash.slice(1);
	return visibleIds.includes(id) ? id : "operations";
};

export default function App() {
	const { me, loading, signOut } = useAuth();
	const [tab, setTab] = useState<string>(() => window.location.hash.slice(1) || "operations");

	useEffect(() => {
		const onHash = () => setTab(window.location.hash.slice(1) || "operations");
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	if (loading) return <div className="grid min-h-screen place-items-center text-slate-400">Loading…</div>;
	if (!me) return <SignIn />;

	const visibleTabs = TABS.filter((t) => t.cap === null || can(me, t.cap));
	const visibleIds = visibleTabs.map((t) => t.id);
	const activeTab = visibleIds.includes(tab) ? tab : tabFromHash(visibleIds);

	const select = (id: string) => {
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
						{/* OHCS Logo — matches login page */}
						<img
							src="/ohcs-logo.png"
							alt="Ghana Civil Service"
							className="h-10 w-10 shrink-0 rounded-full object-cover shadow-md ring-1 ring-white/30"
						/>
						<div>
							<h1 className="text-lg font-semibold leading-tight tracking-tight">Intelligent Integration Engine</h1>
							<p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-slate-400">OHCS · Process Intelligence Platform</p>
						</div>
						<div className="ml-auto flex items-center gap-3 text-[11px] text-slate-300">
							<span className="hidden sm:block">{me.email}</span>
							<span className="rounded-full bg-white/10 px-2 py-0.5">{me.roles.join(" · ")}</span>
							<button onClick={() => void signOut()} className="rounded-full border border-white/15 px-2 py-0.5 hover:bg-white/10">
								Sign out
							</button>
						</div>
					</div>
					<nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-0 pt-3">
						{visibleTabs.map((t) => (
							<button
								key={t.id}
								onClick={() => select(t.id)}
								className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-all duration-150 ${
									activeTab === t.id
										? "bg-slate-100 text-slate-900 shadow-[0_-2px_8px_rgba(0,0,0,0.15)]"
										: "text-slate-400 hover:bg-white/5 hover:text-white"
								}`}
							>
								<span className={activeTab === t.id ? "text-indigo-600" : "text-slate-500"}>{t.icon}</span>
								{t.label}
							</button>
						))}
					</nav>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-4 py-6">
				{activeTab === "operations" && <Operations />}
				{activeTab === "intelligence" && <Intelligence />}
				{activeTab === "decision" && <DecisionSupport />}
				{activeTab === "leave" && <MyLeave />}
				{activeTab === "admin" && <Admin />}
				{activeTab === "attendance" && <Attendance />}
			</main>

			<ChatWidget />
		</div>
	);
}
