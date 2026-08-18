/**
 * RBAC area capabilities. Leave-approval eligibility is NOT here — it stays in
 * src/lib/workflow.ts STEP_RULES (on employees.role + department). These
 * capabilities gate access to system AREAS only.
 */

export const ROLE_KEYS = ["employee", "hr_admin", "process_analyst", "executive", "system_admin"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export type Capability =
	| "events.read.any"
	| "intelligence.read"
	| "decision.read"
	| "reports.read"
	| "attendance.read.any"
	| "leave.read.any"
	| "leave.create.any"
	| "org.read"
	| "admin.users.manage"
	| "admin.roles.manage"
	| "admin.audit.read"
	| "config.manage";

export const ROLE_CAPABILITIES: Record<RoleKey, Capability[]> = {
	employee: ["reports.read"],
	hr_admin: ["attendance.read.any", "leave.read.any", "leave.create.any", "org.read", "events.read.any", "reports.read", "intelligence.read"],
	process_analyst: ["intelligence.read", "events.read.any", "reports.read"],
	executive: ["decision.read", "reports.read", "intelligence.read"],
	system_admin: ["admin.users.manage", "admin.roles.manage", "admin.audit.read", "config.manage", "org.read", "reports.read", "intelligence.read"],
};

export function isRoleKey(value: string): value is RoleKey {
	return (ROLE_KEYS as readonly string[]).includes(value);
}

export function capabilitiesFor(roles: string[]): Set<Capability> {
	const caps = new Set<Capability>();
	for (const r of roles) {
		if (isRoleKey(r)) for (const c of ROLE_CAPABILITIES[r]) caps.add(c);
	}
	return caps;
}

export function hasCapability(roles: string[], cap: Capability): boolean {
	return capabilitiesFor(roles).has(cap);
}
