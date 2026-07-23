import type { MiddlewareHandler } from "hono";

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
