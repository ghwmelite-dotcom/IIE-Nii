// src/lib/email.ts
/**
 * Sends the OTP email. In non-production environments (or when no sender is
 * configured) it logs the code to observability instead of sending, so staging
 * and tests work before a verified sender domain exists (spec §7 risk).
 *
 * Production transport is Resend (https://resend.com). It is a single
 * integration point so the rest of the system stays transport-agnostic.
 * Requires two config values in production:
 *   - EMAIL_SENDER  (e.g. "OHCS IIE <no-reply@ohcsghana.org>") — a verified Resend sender
 *   - RESEND_API_KEY (secret) — from the Resend dashboard
 */
export async function sendOtpEmail(env: Env, to: string, code: string): Promise<void> {
	// Fail-closed allowlist: ONLY these explicitly-named non-prod environments log
	// the code instead of sending. Any other value — including an unset or
	// misspelled ENVIRONMENT — is treated as production so a config slip can never
	// leak a plaintext OTP to observability.
	if (["local", "development", "staging", "test"].includes(env.ENVIRONMENT)) {
		console.log(JSON.stringify({ message: "otp email (dev)", to, code }));
		return;
	}
	if (!env.EMAIL_SENDER) throw new Error("EMAIL_SENDER must be configured to send OTP email in production");
	if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY must be configured to send OTP email in production");
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			from: env.EMAIL_SENDER,
			to: [to],
			subject: "Your OHCS IIE sign-in code",
			text: `Your OHCS IIE sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
		}),
	});
	if (!res.ok) {
		console.error(JSON.stringify({ message: "otp email failed", status: res.status }));
		throw new Error("Email send failed");
	}
}
