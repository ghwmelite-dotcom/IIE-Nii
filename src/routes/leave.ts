import { Hono } from "hono";
import { z } from "zod";
import { insertEvents, toStoredEvent } from "../lib/events";
import { STEP_RULES, isLeaveStep } from "../lib/workflow";
import type { LeaveStep } from "../lib/workflow";

const app = new Hono<{ Bindings: Env }>();

const createRequestSchema = z
	.object({
		employee_id: z.string().min(1),
		type: z.string().min(1),
		start_date: z.iso.date(),
		end_date: z.iso.date(),
	})
	.refine((d) => d.end_date >= d.start_date, { message: "end_date must not precede start_date" });

const transitionSchema = z.object({
	action: z.enum(["approve", "reject", "cancel"]),
	actor_id: z.string().min(1),
	reason: z.string().optional(),
});

interface EmployeeRow {
	employee_id: string;
	name: string;
	department_id: string;
	role: string;
}

interface LeaveRequestRow {
	request_id: string;
	employee_id: string;
	type: string;
	start_date: string;
	end_date: string;
	status: string;
	current_step: string;
	created_at: string;
}

// Submit a new leave request (PRD §5.3).
app.post("/request", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = createRequestSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid leave request", issues: parsed.error.issues }, 400);
	}

	const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE employee_id = ?")
		.bind(parsed.data.employee_id)
		.first<EmployeeRow>();
	if (!employee) {
		return c.json({ error: "Unknown employee" }, 404);
	}

	const requestId = crypto.randomUUID();
	const now = new Date().toISOString();
	const firstStep: LeaveStep = "manager_review";

	await c.env.DB.batch([
		c.env.DB.prepare(
			"INSERT INTO leave_requests (request_id, employee_id, type, start_date, end_date, status, current_step) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
		).bind(requestId, employee.employee_id, parsed.data.type, parsed.data.start_date, parsed.data.end_date, firstStep),
		c.env.DB.prepare(
			`INSERT INTO workflow_transitions (transition_id, request_id, from_step, to_step, actor_id, "timestamp") VALUES (?, ?, 'submitted', ?, ?, ?)`,
		).bind(crypto.randomUUID(), requestId, firstStep, employee.employee_id, now),
	]);
	await insertEvents(c.env.DB, [
		toStoredEvent({
			case_id: requestId,
			activity: "leave_submitted",
			resource: employee.employee_id,
			timestamp: now,
			source_system: "LEAVE_WORKFLOW",
			metadata: {
				request_id: requestId,
				department: employee.department_id,
				leave_type: parsed.data.type,
				from_step: "submitted",
				to_step: firstStep,
			},
		}),
	]);

	return c.json({ request_id: requestId, status: "pending", current_step: firstStep }, 201);
});

// Advance the workflow: approve | reject | cancel (PRD §5.3).
app.post("/:id/transition", async (c) => {
	const requestId = c.req.param("id");
	const body = await c.req.json().catch(() => null);
	const parsed = transitionSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: "Invalid transition", issues: parsed.error.issues }, 400);
	}

	const request = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE request_id = ?")
		.bind(requestId)
		.first<LeaveRequestRow>();
	if (!request) {
		return c.json({ error: "Leave request not found" }, 404);
	}
	if (request.status !== "pending") {
		return c.json({ error: `Request is already ${request.status}` }, 409);
	}

	const actor = await c.env.DB.prepare("SELECT * FROM employees WHERE employee_id = ?")
		.bind(parsed.data.actor_id)
		.first<EmployeeRow>();
	if (!actor) {
		return c.json({ error: "Unknown actor" }, 404);
	}

	const now = new Date().toISOString();
	const step = request.current_step;

	// Cancellation is the requester's action, available at any pending step.
	if (parsed.data.action === "cancel") {
		if (actor.employee_id !== request.employee_id) {
			return c.json({ error: "Only the requester can cancel" }, 403);
		}
		await finishRequest(c.env.DB, request, step, "cancelled", actor, now, parsed.data.reason);
		return c.json({ request_id: requestId, status: "cancelled" });
	}

	if (!isLeaveStep(step)) {
		return c.json({ error: `Request is in a non-actionable step: ${step}` }, 409);
	}
	const rule = STEP_RULES[step];
	// Line-manager approvals must come from a manager in the requester's department.
	const requester = await c.env.DB.prepare("SELECT department_id FROM employees WHERE employee_id = ?")
		.bind(request.employee_id)
		.first<{ department_id: string }>();
	if (actor.role !== rule.role || (rule.departmentScoped && actor.department_id !== requester?.department_id)) {
		return c.json({ error: `Step '${step}' requires role '${rule.role}'${rule.departmentScoped ? " in the requester's department" : ""}` }, 403);
	}

	if (parsed.data.action === "reject") {
		if (!parsed.data.reason) {
			return c.json({ error: "Rejection requires a reason" }, 400);
		}
		await recordStep(c.env.DB, request, step, "rejected", actor, now, parsed.data.reason);
		await finishRequest(c.env.DB, request, step, "rejected", actor, now, parsed.data.reason);
		return c.json({ request_id: requestId, status: "rejected" });
	}

	// approve
	await recordStep(c.env.DB, request, step, "approved", actor, now);
	const next = rule.next;
	if (next === "completed") {
		await finishRequest(c.env.DB, request, step, "completed", actor, now);
		return c.json({ request_id: requestId, status: "completed" });
	}
	await c.env.DB.batch([
		c.env.DB.prepare("UPDATE leave_requests SET current_step = ? WHERE request_id = ?").bind(next, requestId),
		c.env.DB.prepare(
			`INSERT INTO workflow_transitions (transition_id, request_id, from_step, to_step, actor_id, "timestamp") VALUES (?, ?, ?, ?, ?, ?)`,
		).bind(crypto.randomUUID(), requestId, step, next, actor.employee_id, now),
	]);
	return c.json({ request_id: requestId, status: "pending", current_step: next });
});

// Current status + full transition history (PRD §10).
app.get("/:id/status", async (c) => {
	const requestId = c.req.param("id");
	const request = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE request_id = ?")
		.bind(requestId)
		.first<LeaveRequestRow>();
	if (!request) {
		return c.json({ error: "Leave request not found" }, 404);
	}
	const { results: history } = await c.env.DB.prepare(
		`SELECT from_step, to_step, actor_id, "timestamp" FROM workflow_transitions WHERE request_id = ? ORDER BY "timestamp" ASC`,
	)
		.bind(requestId)
		.all();
	return c.json({ ...request, history });
});

/** Emit the event for the step just acted on (approved/rejected decision). */
async function recordStep(
	db: D1Database,
	request: LeaveRequestRow,
	step: LeaveStep,
	decision: "approved" | "rejected",
	actor: EmployeeRow,
	now: string,
	reason?: string,
) {
	await insertEvents(db, [
		toStoredEvent({
			case_id: request.request_id,
			activity: step,
			resource: actor.employee_id,
			timestamp: now,
			source_system: "LEAVE_WORKFLOW",
			metadata: { request_id: request.request_id, decision, from_step: step, to_step: decision === "rejected" ? "rejected" : STEP_RULES[step].next, ...(reason ? { reason } : {}) },
		}),
	]);
}

/** Move a request to a terminal state and emit the terminal event. */
async function finishRequest(
	db: D1Database,
	request: LeaveRequestRow,
	fromStep: string,
	terminal: "completed" | "rejected" | "cancelled",
	actor: EmployeeRow,
	now: string,
	reason?: string,
) {
	await db.batch([
		db.prepare("UPDATE leave_requests SET status = ?, current_step = ? WHERE request_id = ?").bind(terminal, terminal, request.request_id),
		db.prepare(
			`INSERT INTO workflow_transitions (transition_id, request_id, from_step, to_step, actor_id, "timestamp") VALUES (?, ?, ?, ?, ?, ?)`,
		).bind(crypto.randomUUID(), request.request_id, fromStep, terminal, actor.employee_id, now),
	]);
	await insertEvents(db, [
		toStoredEvent({
			case_id: request.request_id,
			activity: terminal,
			resource: actor.employee_id,
			timestamp: now,
			source_system: "LEAVE_WORKFLOW",
			metadata: { request_id: request.request_id, from_step: fromStep, to_step: terminal, ...(reason ? { reason } : {}) },
		}),
	]);
}

export default app;
