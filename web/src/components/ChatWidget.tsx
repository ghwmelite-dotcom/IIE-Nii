import { useState } from "react";
import { api } from "../api";
import EmployeePicker from "./EmployeePicker";

interface Message {
	role: "user" | "bot";
	text: string;
	sources?: string[];
}

export default function ChatWidget() {
	const [open, setOpen] = useState(false);
	const [employeeId, setEmployeeId] = useState("EMP-0001");
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);

	async function send() {
		const text = input.trim();
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
				className="fixed bottom-4 right-4 z-50 rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-slate-700"
			>
				Ask OHCS assistant
			</button>
		);
	}

	return (
		<div className="fixed bottom-4 right-4 z-50 flex h-[480px] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-slate-300 bg-white shadow-2xl">
			<div className="flex items-center gap-2 rounded-t-xl bg-slate-900 px-3 py-2 text-white">
				<span className="text-sm font-medium">OHCS assistant</span>
				<EmployeePicker
					value={employeeId}
					onChange={setEmployeeId}
					className="ml-auto w-40 truncate rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200 outline-none"
				/>
				<button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close">
					✕
				</button>
			</div>

			<div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
				{messages.length === 0 && (
					<p className="text-slate-400">Ask about HR policy, your attendance, or leave balance — or request leave in plain language.</p>
				)}
				{messages.map((m, i) => (
					<div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
						<div
							className={`inline-block max-w-[85%] rounded-lg px-3 py-2 ${
								m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
							}`}
						>
							{m.text}
						</div>
						{m.sources && m.sources.length > 0 && <div className="mt-0.5 text-[10px] text-slate-400">Sources: {m.sources.join(", ")}</div>}
					</div>
				))}
				{busy && <div className="text-xs text-slate-400">Thinking…</div>}
			</div>

			<div className="flex gap-2 border-t border-slate-200 p-2">
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && send()}
					placeholder="Type a message…"
					className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
				/>
				<button onClick={send} disabled={busy} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
					Send
				</button>
			</div>
		</div>
	);
}
