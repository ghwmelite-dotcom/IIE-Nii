import { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

const LAST_EMAIL_KEY = "iie_last_email";
const REMEMBER_KEY = "iie_remember_email";

function Spinner() {
	return (
		<svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
		</svg>
	);
}

function getSavedEmail(): string {
	if (localStorage.getItem(REMEMBER_KEY) === "true") {
		return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
	}
	return "";
}

export default function SignIn() {
	const { refresh } = useAuth();
	const [email, setEmail] = useState(getSavedEmail);
	const [remember, setRemember] = useState(localStorage.getItem(REMEMBER_KEY) === "true");
	const [code, setCode] = useState("");
	const [stage, setStage] = useState<"email" | "code">("email");
	const [msg, setMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	async function sendCode() {
		setBusy(true);
		setMsg(null);
		try {
			await api.requestCode(email.trim());
			if (remember) {
				localStorage.setItem(LAST_EMAIL_KEY, email.trim());
				localStorage.setItem(REMEMBER_KEY, "true");
			} else {
				localStorage.removeItem(LAST_EMAIL_KEY);
				localStorage.setItem(REMEMBER_KEY, "false");
			}
			setStage("code");
			setMsg("A 6-digit code has been sent to your email. It expires in 10 minutes.");
		} catch {
			setMsg("Could not send a code. Please try again.");
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
			setMsg("Invalid or expired code. Please request a new one.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden">
			{/* Animated gradient background */}
			<div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-emerald-950" />
			<div className="absolute inset-0 opacity-20">
				<div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-indigo-500 blur-[120px]" />
				<div className="absolute -right-1/4 -bottom-1/4 h-[500px] w-[500px] rounded-full bg-emerald-600 blur-[100px]" />
			</div>

			{/* Subtle grid pattern overlay */}
			<div
				className="absolute inset-0 opacity-[0.03]"
				style={{
					backgroundImage:
						"linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
					backgroundSize: "60px 60px",
				}}
			/>

			<div
				className={`relative z-10 w-full max-w-md px-4 transition-all duration-700 ${mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
			>
				{/* Card */}
				<div className="overflow-hidden rounded-2xl border border-white/10 bg-white/95 shadow-2xl backdrop-blur-sm">
					{/* Top accent bar */}
					<div className="h-1.5 bg-gradient-to-r from-red-600 via-yellow-400 to-green-600" />

					<div className="px-8 pb-8 pt-7">
						{/* Header */}
						<div className="mb-8 text-center">
							{/* OHCS Logo */}
							<div className="mb-4 flex justify-center">
								<div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-white/20 shadow-xl">
									<img
										src="/ohcs-logo.png"
										alt="Ghana Civil Service"
										className="h-full w-full object-cover"
									/>
								</div>
							</div>

							<h1 className="text-xl font-bold tracking-tight text-slate-900">
								Office of the Head of Civil Service
							</h1>
							<p className="mt-1 text-sm font-medium text-slate-500">
								Intelligent Integration Engine
							</p>
							<div className="mx-auto mt-3 h-px w-16 bg-gradient-to-r from-transparent via-yellow-500 to-transparent" />
						</div>

						{/* Stage indicator */}
						<div className="mb-6 flex items-center justify-center gap-2">
							<div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${stage === "email" ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white"}`}>
								1
							</div>
							<div className={`h-0.5 w-8 transition-colors duration-300 ${stage === "code" ? "bg-emerald-500" : "bg-slate-200"}`} />
							<div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${stage === "code" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"}`}>
								2
							</div>
						</div>

						{/* Form */}
						<div className="relative min-h-[140px]">
							{stage === "email" ? (
								<div className="animate-[fadeIn_0.4s_ease-out]">
									<label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
										Work Email
									</label>
									<input
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										type="email"
										autoComplete="email"
										placeholder="you@ohcs.gov.gh"
										className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
										onKeyDown={(e) => e.key === "Enter" && email && sendCode()}
									/>
									<label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-500">
										<input
											type="checkbox"
											checked={remember}
											onChange={(e) => setRemember(e.target.checked)}
											className="h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600"
										/>
										Remember my email
									</label>
									<button
										onClick={sendCode}
										disabled={busy || !email}
										className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:from-indigo-700 hover:to-indigo-800 hover:shadow-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
									>
										{busy ? <Spinner /> : "Send verification code"}
									</button>
								</div>
							) : (
								<div className="animate-[fadeIn_0.4s_ease-out]">
									<div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-center">
										<p className="text-xs text-emerald-700">
											Code sent to <span className="font-semibold">{email}</span>
										</p>
									</div>
									<label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
										Verification Code
									</label>
									<input
										value={code}
										onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
										inputMode="numeric"
										placeholder="000000"
										maxLength={6}
										className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-mono tracking-[0.3em] text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
										onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
									/>
									<button
										onClick={verify}
										disabled={busy || code.length !== 6}
										className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:from-emerald-700 hover:to-emerald-800 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
									>
										{busy ? <Spinner /> : "Verify & sign in"}
									</button>
									<button
										onClick={() => { setStage("email"); setCode(""); setMsg(null); }}
										className="mt-3 w-full text-center text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
									>
										← Use a different email
									</button>
								</div>
							)}
						</div>

						{/* Message */}
						{msg && (
							<div className={`mt-4 rounded-lg px-4 py-3 text-center text-xs font-medium animate-[fadeIn_0.3s_ease-out] ${msg.includes("sent") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
								{msg}
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="border-t border-slate-100 bg-slate-50/50 px-8 py-4 text-center">
						<p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
							Republic of Ghana · Civil Service
						</p>
						<p className="mt-1 text-[10px] text-slate-300">
							Secured by passwordless OTP · 10-minute expiry
						</p>
					</div>
				</div>

				{/* Bottom links */}
				<div className="mt-6 text-center">
					<p className="text-xs text-white/40">
						Demo credentials available in <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/60">IIE_Test_Credentials.docx</code>
					</p>
				</div>
			</div>
		</div>
	);
}
