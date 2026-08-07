const COOKIE = "iie_session";
const IDLE_TTL_SECONDS = 8 * 60 * 60; // 8h sliding
const ABSOLUTE_TTL_SECONDS = 24 * 60 * 60; // hard re-auth ceiling regardless of activity

export interface SessionData {
	userId: string;
	email: string;
	createdAt: string;
}

const enc = new TextEncoder();

async function hmacKey(env: Env): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", enc.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64url(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** value.signature — signature is HMAC-SHA256(value). */
export async function signValue(env: Env, value: string): Promise<string> {
	const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(value));
	return `${value}.${b64url(sig)}`;
}

export async function verifyValue(env: Env, signed: string): Promise<string | null> {
	const dot = signed.lastIndexOf(".");
	if (dot <= 0) return null;
	const value = signed.slice(0, dot);
	const expected = await signValue(env, value);
	if (signed.length !== expected.length) return null;
	let diff = 0;
	for (let i = 0; i < signed.length; i++) diff |= signed.charCodeAt(i) ^ expected.charCodeAt(i);
	return diff === 0 ? value : null;
}

function cookieValue(header: string): string | null {
	for (const part of header.split(/;\s*/)) {
		const eq = part.indexOf("=");
		if (eq > 0 && part.slice(0, eq) === COOKIE) return part.slice(eq + 1);
	}
	return null;
}

export async function createSession(env: Env, data: Omit<SessionData, "createdAt">): Promise<{ cookie: string; sessionId: string; setCookie: string }> {
	const sessionId = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
	const record: SessionData = { ...data, createdAt: new Date().toISOString() };
	await env.AUTH.put(`sess:${sessionId}`, JSON.stringify(record), { expirationTtl: IDLE_TTL_SECONDS });
	const signed = await signValue(env, sessionId);
	const setCookie = `${COOKIE}=${signed}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${IDLE_TTL_SECONDS}`;
	return { cookie: `${COOKIE}=${signed}`, sessionId, setCookie };
}

/** Accepts a full Cookie header or a single `iie_session=...` string. */
export async function readSession(env: Env, cookieHeader: string): Promise<(SessionData & { sessionId: string }) | null> {
	const raw = cookieHeader.includes(COOKIE) ? cookieValue(cookieHeader) : null;
	if (!raw) return null;
	const sessionId = await verifyValue(env, raw);
	if (!sessionId) return null;
	const record = await env.AUTH.get(`sess:${sessionId}`);
	if (!record) return null;
	const data = JSON.parse(record) as SessionData;
	// Absolute lifetime cap: sliding idle expiry must not let a session live forever.
	if (Date.now() - new Date(data.createdAt).getTime() > ABSOLUTE_TTL_SECONDS * 1000) {
		await env.AUTH.delete(`sess:${sessionId}`);
		return null;
	}
	await env.AUTH.put(`sess:${sessionId}`, record, { expirationTtl: IDLE_TTL_SECONDS });
	return { ...data, sessionId };
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
	await env.AUTH.delete(`sess:${sessionId}`);
}

export function clearCookie(): string {
	return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
