import { capabilitiesFor, type Capability } from "./rbac";

export interface UserRow {
	user_id: string;
	email: string;
	employee_id: string | null;
	status: string;
}

export interface LinkedEmployee {
	employee_id: string;
	name: string;
	department_id: string;
	role: string;
}

export interface RoleScope {
	role_id: string;
	scope_type: string;
	scope_id: string;
}

export interface UserContext {
	user: UserRow;
	roles: string[];
	capabilities: Capability[];
	scopes: RoleScope[];
	employee: LinkedEmployee | null;
}

export async function findActiveUserByEmail(env: Env, email: string): Promise<UserRow | null> {
	return env.DB.prepare("SELECT user_id, email, employee_id, status FROM users WHERE email = ? AND status = 'active'")
		.bind(email.toLowerCase())
		.first<UserRow>();
}

export async function touchLastLogin(env: Env, userId: string): Promise<void> {
	await env.DB.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?").bind(userId).run();
}

export async function loadUserContext(env: Env, userId: string): Promise<UserContext | null> {
	const user = await env.DB.prepare("SELECT user_id, email, employee_id, status FROM users WHERE user_id = ?").bind(userId).first<UserRow>();
	if (!user || user.status !== "active") return null;

	const { results: roleRows } = await env.DB.prepare(
		"SELECT role_id, scope_type, scope_id FROM user_roles WHERE user_id = ?",
	).bind(userId).all<RoleScope>();
	const roles = [...new Set(roleRows.map((r) => r.role_id))];

	let employee: LinkedEmployee | null = null;
	if (user.employee_id) {
		employee = await env.DB.prepare("SELECT employee_id, name, department_id, role FROM employees WHERE employee_id = ?")
			.bind(user.employee_id)
			.first<LinkedEmployee>();
	}
	return { user, roles, capabilities: [...capabilitiesFor(roles)], scopes: roleRows, employee };
}

/** True if the user holds `roleId` either globally (scope_id '') or scoped to `departmentId`. */
export function hasScopedRole(ctx: UserContext, roleId: string, departmentId: string | undefined): boolean {
	return ctx.scopes.some(
		(s) => s.role_id === roleId && (s.scope_id === "" || (departmentId !== undefined && s.scope_id === departmentId)),
	);
}

/** Create a `users` row + default `employee` role for every employee that has none. */
export async function bulkProvisionFromEmployees(env: Env): Promise<{ created: number; missingEmail: string[] }> {
	const { results } = await env.DB.prepare(
		`SELECT e.employee_id, e.email FROM employees e
		 LEFT JOIN users u ON u.employee_id = e.employee_id
		 WHERE u.user_id IS NULL`,
	).all<{ employee_id: string; email: string | null }>();

	const missingEmail: string[] = [];
	const stmts: D1PreparedStatement[] = [];
	for (const e of results) {
		if (!e.email) {
			missingEmail.push(e.employee_id);
			continue;
		}
		const userId = crypto.randomUUID();
		stmts.push(
			env.DB.prepare("INSERT INTO users (user_id, email, employee_id) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
				.bind(userId, e.email.toLowerCase(), e.employee_id),
			env.DB.prepare("INSERT INTO user_roles (user_id, role_id) SELECT user_id, 'employee' FROM users WHERE employee_id = ? ON CONFLICT DO NOTHING")
				.bind(e.employee_id),
		);
	}
	for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
	return { created: results.length - missingEmail.length, missingEmail };
}
