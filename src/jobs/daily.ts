/**
 * Daily housekeeping (PRD §5.2, §5.3): runs after work hours (18:43 UTC = Accra).
 *  - attendance anomaly: today's clock-ins with no clock-out → anomaly_detected events
 *  - leave escalation: requests idle at one step for >48h → escalated events
 * Both write to the unified event log so the anomalies feed process mining.
 */

import { insertEvents, toStoredEvent } from "../lib/events";
import type { StoredEvent } from "../lib/events";

const ESCALATION_AFTER_MS = 48 * 3600_000;

interface MissingClockOutRow {
	employee_id: string;
	department_id: string | null;
}

interface PendingRow {
	request_id: string;
	employee_id: string;
	current_step: string;
	last_action: string | null;
}

export interface DailySummary {
	ran_at: string;
	missing_clockouts: number;
	escalations: number;
}

export async function runDailyChecks(env: Env): Promise<DailySummary> {
	const ranAt = new Date().toISOString();
	const today = ranAt.slice(0, 10);
	const events: StoredEvent[] = [];

	const { results: missing } = await env.DB.prepare(
		`SELECT ar.employee_id, e.department_id
		 FROM attendance_records ar
		 LEFT JOIN employees e ON e.employee_id = ar.employee_id
		 WHERE ar.date = ? AND ar.clock_out IS NULL`,
	)
		.bind(today)
		.all<MissingClockOutRow>();

	for (const row of missing) {
		events.push(
			toStoredEvent({
				case_id: `att-${row.employee_id}-${today}`,
				activity: "anomaly_detected",
				resource: "attendance-worker",
				source_system: "ATTENDANCE",
				metadata: { type: "missing_clock_out", employee: row.employee_id, department: row.department_id },
			}),
		);
	}

	const cutoff = new Date(Date.now() - ESCALATION_AFTER_MS).toISOString();
	const { results: pending } = await env.DB.prepare(
		`SELECT lr.request_id, lr.employee_id, lr.current_step, MAX(wt."timestamp") AS last_action
		 FROM leave_requests lr
		 LEFT JOIN workflow_transitions wt ON wt.request_id = lr.request_id
		 WHERE lr.status = 'pending'
		 GROUP BY lr.request_id
		 HAVING last_action IS NULL OR last_action < ?`,
	)
		.bind(cutoff)
		.all<PendingRow>();

	for (const row of pending) {
		// Don't re-escalate a step that already has an escalation since its last action.
		const already = await env.DB.prepare(
			`SELECT 1 FROM events WHERE case_id = ? AND activity = 'escalated' AND "timestamp" > ? LIMIT 1`,
		)
			.bind(row.request_id, row.last_action ?? "")
			.first();
		if (already) continue;

		events.push(
			toStoredEvent({
				case_id: row.request_id,
				activity: "escalated",
				resource: "leave-workflow-worker",
				source_system: "LEAVE_WORKFLOW",
				metadata: { request_id: row.request_id, step: row.current_step, pending_since: row.last_action },
			}),
		);
	}

	if (events.length > 0) {
		await insertEvents(env.DB, events);
	}

	const summary: DailySummary = { ran_at: ranAt, missing_clockouts: missing.length, escalations: events.length - missing.length };
	console.log(JSON.stringify({ message: "daily checks completed", ...summary }));
	return summary;
}
