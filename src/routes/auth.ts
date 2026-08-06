import { Hono } from "hono";
import { z } from "zod";
import { issueOtp, verifyOtp, checkRateLimit } from "../lib/otp";
import { sendOtpEmail } from "../lib/email";
import { findActiveUserByEmail, touchLastLogin } from "../lib/users";
import { createSession, readSession, deleteSession, clearCookie } from "../lib/session";
import { requireUser, requireCsrf, currentUser, type AuthEnv } from "../lib/auth";
import { writeAudit } from "../lib/audit";

const app = new Hono<AuthEnv>();

const emailSchema = z.object({ email: z.string().email() });
const verifySchema = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) });

app.post("/request-code", requireCsrf, async (c) => {
	const parsed = emailSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid email" }, 400);
	const email = parsed.data.email.toLowerCase();
	const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
	if (!(await checkRateLimit(c.env, `req:${email}`)) || !(await checkRateLimit(c.env, `ip:${ip}`))) {
		return c.json({ error: "Too many requests" }, 429);
	}
	const user = await findActiveUserByEmail(c.env, email);
	if (user) {
		const code = await issueOtp(c.env, email);
		if (c.env.ENVIRONMENT !== "production") await c.env.AUTH.put(`otp-plain:${email}`, code, { expirationTtl: 600 });
		await sendOtpEmail(c.env, email, code);
	}
	return c.json({ status: "sent" }, 202);
});

app.post("/verify", requireCsrf, async (c) => {
	const parsed = verifySchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid code" }, 400);
	const email = parsed.data.email.toLowerCase();
	const user = await findActiveUserByEmail(c.env, email);
	if (!user || !(await verifyOtp(c.env, email, parsed.data.code))) {
		return c.json({ error: "Invalid or expired code" }, 401);
	}
	await touchLastLogin(c.env, user.user_id);
	const { setCookie } = await createSession(c.env, { userId: user.user_id, email });
	await writeAudit(c.env, { actorUserId: user.user_id, actorEmail: email, action: "auth.login" });
	c.header("Set-Cookie", setCookie);
	return c.json({ status: "ok" });
});

app.get("/me", requireUser, (c) => {
	const u = currentUser(c);
	return c.json({
		email: u.user.email,
		user_id: u.user.user_id,
		employee_id: u.user.employee_id,
		employee: u.employee,
		roles: u.roles,
		capabilities: u.capabilities,
		scopes: u.scopes,
	});
});

app.post("/logout", requireUser, requireCsrf, async (c) => {
	const cookie = c.req.header("Cookie") ?? "";
	const sess = await readSession(c.env, cookie);
	if (sess) await deleteSession(c.env, sess.sessionId);
	c.header("Set-Cookie", clearCookie());
	return c.json({ status: "ok" });
});

export default app;
