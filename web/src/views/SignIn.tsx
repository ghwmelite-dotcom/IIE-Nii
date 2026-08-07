import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

export default function SignIn() {
	const { refresh } = useAuth();
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [stage, setStage] = useState<"email" | "code">("email");
	const [msg, setMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function sendCode() {
		setBusy(true);
		setMsg(null);
		try {
			await api.requestCode(email.trim());
			setStage("code");
			setMsg("If that address is registered, a code is on its way.");
		} catch {
			setMsg("Could not send a code. Try again.");
		} finally {
			setBusy(false);
		}
	}

	async function verify() {
		setBusy(true);
		setMsg(null);
		try {
			await api.verifyCode(email.trim(), code.trim());
			await refresh();
		} catch {
			setMsg("Invalid or expired code.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
			<div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
				<h1 className="text-lg font-semibold">OHCS · Intelligent Integration Engine</h1>
				<p className="mb-4 text-sm text-slate-500">Sign in with your work email.</p>
				{stage === "email" ? (
					<>
						<input
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							type="email"
							placeholder="you@ohcs.gov.gh"
							className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
						/>
						<button
							onClick={sendCode}
							disabled={busy || !email}
							className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50"
						>
							Send code
						</button>
					</>
				) : (
					<>
						<input
							value={code}
							onChange={(e) => setCode(e.target.value)}
							inputMode="numeric"
							placeholder="6-digit code"
							className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-slate-500"
						/>
						<button
							onClick={verify}
							disabled={busy || code.length !== 6}
							className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50"
						>
							Verify & sign in
						</button>
						<button onClick={() => setStage("email")} className="mt-2 w-full text-xs text-slate-500 hover:underline">
							Use a different email
						</button>
					</>
				)}
				{msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}
			</div>
		</div>
	);
}
