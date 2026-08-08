// src/lib/email.ts
/**
 * Sends the OTP email. In non-production environments (or when no sender is
 * configured) it logs the code to observability instead of sending, so staging
 * and tests work before a verified sender domain exists (spec §7 risk).
 *
 * The production transport is intentionally a single integration point so the
 * rest of the system stays transport-agnostic. The concrete transport
 * (MailChannels vs a Cloudflare Email Routing send-worker binding) is confirmed
 * during the go-live task once a verified sender domain exists.
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
	const body = {
		personalizations: [{ to: [{ email: to }] }],
		from: { email: env.EMAIL_SENDER },
		subject: "Your OHCS IIE sign-in code",
		content: [{ type: "text/plain", value: `Your sign-in code is ${code}. It expires in 10 minutes.` }],
	};
	const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		console.error(JSON.stringify({ message: "otp email failed", status: res.status }));
		throw new Error("Email send failed");
	}
}
