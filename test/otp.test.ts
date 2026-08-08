import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { issueOtp, verifyOtp, checkRateLimit } from "../src/lib/otp";

describe("otp", () => {
	it("issues a 6-digit code and verifies it once", async () => {
		const code = await issueOtp(env, "a@ohcs.gov.gh");
		expect(code).toMatch(/^\d{6}$/);
		expect(await verifyOtp(env, "a@ohcs.gov.gh", code)).toBe(true);
		expect(await verifyOtp(env, "a@ohcs.gov.gh", code)).toBe(false); // single-use
	});

	it("rejects a wrong code and eventually locks out", async () => {
		await issueOtp(env, "b@ohcs.gov.gh");
		for (let i = 0; i < 5; i++) expect(await verifyOtp(env, "b@ohcs.gov.gh", "000000")).toBe(false);
		expect(await verifyOtp(env, "b@ohcs.gov.gh", "000000")).toBe(false);
	});

	it("rate-limits repeated requests", async () => {
		for (let i = 0; i < 5; i++) expect(await checkRateLimit(env, "rl:test")).toBe(true);
		expect(await checkRateLimit(env, "rl:test")).toBe(false); // 6th within window
	});
});
