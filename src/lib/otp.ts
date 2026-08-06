const OTP_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const RL_MAX = 5;
const RL_WINDOW_SECONDS = 15 * 60;

const enc = new TextEncoder();

interface OtpRecord {
	hash: string;
	attempts: number;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigits(): string {
	return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

export async function issueOtp(env: Env, email: string): Promise<string> {
	const code = sixDigits();
	const rec: OtpRecord = { hash: await sha256Hex(`${email.toLowerCase()}:${code}`), attempts: 0 };
	await env.AUTH.put(`otp:${email.toLowerCase()}`, JSON.stringify(rec), { expirationTtl: OTP_TTL_SECONDS });
	return code;
}

export async function verifyOtp(env: Env, email: string, code: string): Promise<boolean> {
	const key = `otp:${email.toLowerCase()}`;
	const raw = await env.AUTH.get(key);
	if (!raw) return false;
	const rec = JSON.parse(raw) as OtpRecord;
	if (rec.attempts >= MAX_ATTEMPTS) {
		await env.AUTH.delete(key);
		return false;
	}
	const ok = (await sha256Hex(`${email.toLowerCase()}:${code}`)) === rec.hash;
	if (ok) {
		await env.AUTH.delete(key);
		return true;
	}
	rec.attempts++;
	await env.AUTH.put(key, JSON.stringify(rec), { expirationTtl: OTP_TTL_SECONDS });
	return false;
}

/** Returns true if allowed, false if over the limit. */
export async function checkRateLimit(env: Env, key: string): Promise<boolean> {
	const rlKey = `rl:${key}`;
	const current = Number((await env.AUTH.get(rlKey)) ?? "0");
	if (current >= RL_MAX) return false;
	await env.AUTH.put(rlKey, String(current + 1), { expirationTtl: RL_WINDOW_SECONDS });
	return true;
}
