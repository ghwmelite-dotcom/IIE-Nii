import { applyD1Migrations, env, SELF } from "cloudflare:test";

/** Apply all D1 migrations to the test database (records state, so once per file). */
export async function applyMigrations() {
	await applyD1Migrations(env.DB, env.MIGRATIONS);
}

/** A minimal org: two departments, two staff, and the three workflow roles. */
export async function seedOrg() {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO departments (department_id, name, head_employee_id) VALUES ('D1', 'Administration', 'MGR-1')"),
		env.DB.prepare("INSERT INTO departments (department_id, name, head_employee_id) VALUES ('D2', 'Finance', 'MGR-2')"),
		env.DB.prepare(
			"INSERT INTO employees (employee_id, name, department_id, role, card_id) VALUES ('EMP-1', 'Staff One', 'D1', 'staff', 'CARD-1')",
		),
		env.DB.prepare("INSERT INTO employees (employee_id, name, department_id, role) VALUES ('EMP-2', 'Staff Two', 'D2', 'staff')"),
		env.DB.prepare("INSERT INTO employees (employee_id, name, department_id, role) VALUES ('MGR-1', 'Manager One', 'D1', 'line_manager')"),
		env.DB.prepare("INSERT INTO employees (employee_id, name, department_id, role) VALUES ('MGR-2', 'Manager Two', 'D2', 'line_manager')"),
		env.DB.prepare("INSERT INTO employees (employee_id, name, department_id, role) VALUES ('HR-1', 'HR Officer', 'D1', 'hr_officer')"),
		env.DB.prepare("INSERT INTO employees (employee_id, name, department_id, role) VALUES ('DIR-1', 'Director', 'D1', 'director')"),
	]);
}

export const API_HEADERS = { "Content-Type": "application/json", "x-api-key": "local-dev-key" };

export function apiPost(path: string, body: unknown, headers: Record<string, string> = API_HEADERS) {
	return SELF.fetch(`http://test.local${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

export function apiGet(path: string) {
	return SELF.fetch(`http://test.local${path}`);
}
