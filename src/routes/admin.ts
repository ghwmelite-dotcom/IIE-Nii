import { Hono } from "hono";
import { z } from "zod";
import { requireUser, requireCsrf, requirePermission, currentUser, type AuthEnv } from "../lib/auth";
import { bulkProvisionFromEmployees } from "../lib/users";
import { isRoleKey } from "../lib/rbac";
import { writeAudit } from "../lib/audit";

const app = new Hono<AuthEnv>();
app.use("*", requireUser, requirePermission("admin.users.manage"));

app.get("/users", async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT u.user_id, u.email, u.status, u.last_login_at, e.name, e.department_id,
		        (SELECT GROUP_CONCAT(role_id) FROM user_roles r WHERE r.user_id = u.user_id) AS roles
		 FROM users u LEFT JOIN employees e ON e.employee_id = u.employee_id ORDER BY u.email`,
	).all();
	return c.json({ users: results });
});

app.get("/users/:id", async (c) => {
	const id = c.req.param("id");
	const user = await c.env.DB.prepare("SELECT user_id, email, status, last_login_at, employee_id FROM users WHERE user_id = ?").bind(id).first();
	if (!user) return c.json({ error: "Not found" }, 404);
	const { results: roles } = await c.env.DB.prepare("SELECT role_id, scope_type, scope_id FROM user_roles WHERE user_id = ?").bind(id).all();
	return c.json({ ...user, roles });
});

const roleSchema = z.object({ role_id: z.string(), scope_type: z.string().optional(), scope_id: z.string().optional() });

app.post("/users/:id/roles", requireCsrf, async (c) => {
	const id = c.req.param("id");
	const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success || !isRoleKey(parsed.data.role_id)) return c.json({ error: "Invalid role" }, 400);
	const me = currentUser(c);
	await c.env.DB.prepare(
		"INSERT INTO user_roles (user_id, role_id, scope_type, scope_id, granted_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
	).bind(id, parsed.data.role_id, parsed.data.scope_type ?? "", parsed.data.scope_id ?? "", me.user.user_id).run();
	await writeAudit(c.env, { actorUserId: me.user.user_id, actorEmail: me.user.email, action: "admin.role.grant", targetType: "user", targetId: id, detail: parsed.data });
	return c.json({ status: "ok" });
});

app.post("/users/:id/roles/revoke", requireCsrf, async (c) => {
	const id = c.req.param("id");
	const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid role" }, 400);
	const me = currentUser(c);
	await c.env.DB.prepare("DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND scope_id = ?")
		.bind(id, parsed.data.role_id, parsed.data.scope_id ?? "").run();
	await writeAudit(c.env, { actorUserId: me.user.user_id, actorEmail: me.user.email, action: "admin.role.revoke", targetType: "user", targetId: id, detail: parsed.data });
	return c.json({ status: "ok" });
});

app.post("/users/:id/status", requireCsrf, async (c) => {
	const id = c.req.param("id");
	const parsed = z.object({ status: z.enum(["active", "disabled"]) }).safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid status" }, 400);
	const me = currentUser(c);
	await c.env.DB.prepare("UPDATE users SET status = ? WHERE user_id = ?").bind(parsed.data.status, id).run();
	await writeAudit(c.env, { actorUserId: me.user.user_id, actorEmail: me.user.email, action: "admin.user.status", targetType: "user", targetId: id, detail: { status: parsed.data.status } });
	return c.json({ status: "ok" });
});

app.post("/provision", requireCsrf, async (c) => {
	const me = currentUser(c);
	const result = await bulkProvisionFromEmployees(c.env);
	await writeAudit(c.env, { actorUserId: me.user.user_id, actorEmail: me.user.email, action: "admin.provision", detail: result });
	return c.json(result);
});

app.get("/audit", requirePermission("admin.audit.read"), async (c) => {
	const { results } = await c.env.DB.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
	return c.json({ entries: results });
});

export default app;
