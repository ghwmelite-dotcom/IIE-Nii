import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { createSession, readSession, deleteSession, signValue, verifyValue } from "../src/lib/session";

describe("session store", () => {
	it("signs and verifies a value, rejecting tampering", async () => {
		const signed = await signValue(env, "abc");
		expect(await verifyValue(env, signed)).toBe("abc");
		expect(await verifyValue(env, signed + "x")).toBeNull();
	});

	it("creates a session cookie and reads it back", async () => {
		const { cookie } = await createSession(env, { userId: "u1", email: "a@ohcs.gov.gh" });
		const sess = await readSession(env, cookie);
		expect(sess?.userId).toBe("u1");
	});

	it("returns null after deletion", async () => {
		const { cookie, sessionId } = await createSession(env, { userId: "u2", email: "b@ohcs.gov.gh" });
		await deleteSession(env, sessionId);
		expect(await readSession(env, cookie)).toBeNull();
	});

	it("returns null for a missing/invalid cookie", async () => {
		expect(await readSession(env, "")).toBeNull();
		expect(await readSession(env, "iie_session=garbage")).toBeNull();
	});

	it("rejects and purges a session past the 24h absolute lifetime cap", async () => {
		const { cookie, sessionId } = await createSession(env, { userId: "u3", email: "c@ohcs.gov.gh" });
		const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		await env.AUTH.put(`sess:${sessionId}`, JSON.stringify({ userId: "u3", email: "c@ohcs.gov.gh", createdAt: old }));
		expect(await readSession(env, cookie)).toBeNull();
		expect(await env.AUTH.get(`sess:${sessionId}`)).toBeNull();
	});
});
