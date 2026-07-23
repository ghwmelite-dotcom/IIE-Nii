/**
 * Shared leave-request creation, used by both the REST route
 * (src/routes/leave.ts) and the chatbot's conversational flow (PRD §5.1, §5.3).
 */

import { insertEvents, toStoredEvent } from "./events";

export interface EmployeeRecord {
	employee_id: string;
	name: string;
	department_id: string;
	role: string;
}

export interface LeaveRequestInput {
	type: string;
	start_date: string;
	end_date: string;
}

export async function createLeaveRequest(
	db: D1Database,
	employee: EmployeeRecord,
	input: LeaveRequestInput,
): Promise<{ requestId: string; currentStep: string }> {
	const requestId = crypto.randomUUID();
	const now = new Date().toISOString();
	const firstStep = "manager_review";

	await db.batch([
		db.prepare(
			"INSERT INTO leave_requests (request_id, employee_id, type, start_date, end_date, status, current_step) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
		).bind(requestId, employee.employee_id, input.type, input.start_date, input.end_date, firstStep),
		db.prepare(
			`INSERT INTO workflow_transitions (transition_id, request_id, from_step, to_step, actor_id, "timestamp") VALUES (?, ?, 'submitted', ?, ?, ?)`,
		).bind(crypto.randomUUID(), requestId, firstStep, employee.employee_id, now),
	]);
	await insertEvents(db, [
		toStoredEvent({
			case_id: requestId,
			activity: "leave_submitted",
			resource: employee.employee_id,
			timestamp: now,
			source_system: "LEAVE_WORKFLOW",
			metadata: {
				request_id: requestId,
				department: employee.department_id,
				leave_type: input.type,
				from_step: "submitted",
				to_step: firstStep,
			},
		}),
	]);

	return { requestId, currentStep: firstStep };
}
