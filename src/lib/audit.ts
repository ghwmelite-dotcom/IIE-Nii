export interface AuditEntry {
	actorUserId?: string | null;
	actorEmail?: string | null;
	action: string;
	targetType?: string;
	targetId?: string;
	detail?: Record<string, unknown>;
}

export async function writeAudit(env: Env, e: AuditEntry): Promise<void> {
	await env.DB.prepare(
		"INSERT INTO audit_log (id, actor_user_id, actor_email, action, target_type, target_id, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
	)
		.bind(crypto.randomUUID(), e.actorUserId ?? null, e.actorEmail ?? null, e.action, e.targetType ?? null, e.targetId ?? null, JSON.stringify(e.detail ?? {}))
		.run();
}
