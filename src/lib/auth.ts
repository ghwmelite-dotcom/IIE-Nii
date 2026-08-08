import type { Context, MiddlewareHandler } from "hono";
import { readSession } from "./session";
import { loadUserContext, type UserContext } from "./users";
import type { Capability } from "./rbac";

/**
 * Shared-secret API key for machine-to-machine endpoints (event ingestion,
 * org import, mining triggers, policy ingest). User-facing endpoints stay
 * open for now — per-user identity arrives with Cloudflare Access / SSO.
 *
 * The key lives in the API_KEY secret (wrangler secret put / .dev.vars),
 * never in config or source. Compared timing-safely via fixed-size hashes.
 */
export const apiKeyAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	const expected = c.env.API_KEY;
	if (!expected) {
		console.error(JSON.stringify({ message: "API_KEY secret not configured" }));
		return c.json({ error: "Server auth not configured" }, 500);
	}

	const provided = c.req.header("x-api-key") ?? "";
	const encoder = new TextEncoder();
	const [providedHash, expectedHash] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(provided)),
		crypto.subtle.digest("SHA-256", encoder.encode(expected)),
	]);
	if (!crypto.subtle.timingSafeEqual(providedHash, expectedHash)) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	await next();
};

/** Shared Hono env with the authenticated user attached. */
export type AuthEnv = { Bindings: Env; Variables: { user: UserContext } };

/** Attaches the authenticated user context to the request, or 401s. */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
	const cookie = c.req.header("Cookie") ?? "";
	const sess = await readSession(c.env, cookie);
	if (!sess) return c.json({ error: "Not signed in" }, 401);
	const ctx = await loadUserContext(c.env, sess.userId);
	if (!ctx) return c.json({ error: "Account not active" }, 401);
	c.set("user", ctx);
	await next();
};

/** Requires a capability; use AFTER requireUser. */
export function requirePermission(cap: Capability): MiddlewareHandler<AuthEnv> {
	return async (c, next) => {
		const user = c.get("user");
		if (!user || !user.capabilities.includes(cap)) return c.json({ error: "Forbidden" }, 403);
		await next();
	};
}

/** Lightweight CSRF guard for state-changing routes: requires a fetch header. */
export const requireCsrf: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	if (c.req.header("X-Requested-With") !== "fetch") return c.json({ error: "Missing CSRF header" }, 403);
	await next();
};

export function currentUser(c: Context<AuthEnv>): UserContext {
	return c.get("user");
}
