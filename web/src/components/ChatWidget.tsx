import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import EmployeePicker from "./EmployeePicker";

interface Message {
	role: "user" | "bot";
	text: string;
	sources?: string[];
}

const SUGGESTIONS = [
	"How many days of annual leave am I entitled to?",
	"What is the grace period for morning clock-in?",
	"Who approves study leave applications?",
];

export default function ChatWidget() {
	const [open, setOpen] = useState(false);
	const [employeeId, setEmployeeId] = useState("EMP-0001");
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
	}, [messages, busy]);

	async function send(text = input.trim()) {
		if (!text || busy) return;
		setInput("");
		setMessages((m) => [...m, { role: "user", text }]);
		setBusy(true);
		try {
			const res = await api.chat(employeeId, text);
			setMessages((m) => [...m, { role: "bot", text: res.reply, sources: res.sources }]);
		} catch {
			setMessages((m) => [...m, { role: "bot", text: "Something went wrong — please try again." }]);
		} finally {
			setBusy(false);
		}
	}

	if (!open) {
		return (
			<button
				onClick={() => setOpen(true)}
				className="group fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 py-3 pl-4 pr-5 text-sm font-medium text-white shadow-xl shadow-indigo-600/30 ring-1 ring-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-indigo-600/40"
			>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.8L3 20l1-4.9A8.4 8.4 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4z" />
				</svg>
				Ask OHCS assistant
			</button>
		);
	}

	return (
		<div className="fixed bottom-5 right-5 z-50 flex h-[520px] w-[400px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-2xl shadow-slate-900/25">
			{/* Branded header */}
			<div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 py-3 text-white">
				<div className="flex items-center gap-2.5">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 ring-1 ring-white/20">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
							<circle cx="5.5" cy="6" r="2.2" />
							<circle cx="18.5" cy="6" r="2.2" />
							<circle cx="12" cy="18" r="2.2" />
							<path d="M7.5 7.4 10.3 16M16.5 7.4 13.7 16M7.7 6h8.6" strokeWidth="1.4" />
						</svg>
					</div>
					<div className="min-w-0">
						<div className="text-sm font-semibold leading-tight">OHCS Assistant</div>
						<div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Policy · Attendance · Leave</div>
					</div>
					<button onClick={() => setOpen(false)} className="ml-auto rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
				<div className="mt-2.5 flex items-center gap-2">
					<span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Speaking as</span>
					<EmployeePicker
						value={employeeId}
						onChange={setEmployeeId}
						className="w-full min-w-0 flex-1 truncate rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 outline-none backdrop-blur focus:border-indigo-400/50"
					/>
				</div>
			</div>

			{/* Messages */}
			<div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-4 text-sm">
				{messages.length === 0 && (
					<div className="pt-2">
						<p className="px-1 text-[13px] leading-relaxed text-slate-500">
							Ask about HR policy, your attendance, or leave balance — or request leave in plain language.
						</p>
						<div className="mt-3 flex flex-col gap-1.5">
							{SUGGESTIONS.map((s) => (
								<button
									key={s}
									onClick={() => send(s)}
									className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-left text-[12.5px] text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50"
								>
									{s}
								</button>
							))}
						</div>
					</div>
				)}
				{messages.map((m, i) => (
					<div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
						<div
							className={`max-w-[85%] px-3.5 py-2.5 leading-relaxed shadow-sm ${
								m.role === "user"
									? "rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
									: "rounded-2xl rounded-bl-md border border-slate-200/80 bg-white text-slate-800"
							}`}
						>
							{m.text}
							{m.sources && m.sources.length > 0 && (
								<div className="mt-1.5 flex flex-wrap gap-1">
									{m.sources.map((s) => (
										<span key={s} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9.5px] font-medium text-indigo-600 ring-1 ring-indigo-100">
											{s}
										</span>
									))}
								</div>
							)}
						</div>
					</div>
				))}
				{busy && (
					<div className="flex justify-start">
						<div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
							{[0, 1, 2].map((d) => (
								<span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 150}ms` }} />
							))}
						</div>
					</div>
				)}
			</div>

			{/* Composer */}
			<div className="border-t border-slate-200/80 bg-white p-2.5">
				<div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-4 pr-1 transition-colors focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
					<input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && send()}
						placeholder="Type a message…"
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
					/>
					<button
						onClick={() => send()}
						disabled={busy || !input.trim()}
						aria-label="Send"
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 transition-all hover:shadow-lg disabled:opacity-40 disabled:shadow-none"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}
