/**
 * Leave approval state machine (PRD §5.3).
 * submitted → manager_review → hr_verification → director_approval → completed
 * Any step may instead reject (with reason); the requester may cancel while pending.
 * Activity names double as the event activities the mining conformance checker
 * expects (src/mining/conformance.ts) — keep them in sync.
 */

export const LEAVE_STEPS = ["manager_review", "hr_verification", "director_approval"] as const;
export type LeaveStep = (typeof LEAVE_STEPS)[number];

export type ActorRole = "line_manager" | "hr_officer" | "director";

export interface StepRule {
	next: LeaveStep | "completed";
	role: ActorRole;
	/** line_manager must also belong to the requester's department. */
	departmentScoped: boolean;
}

export const STEP_RULES: Record<LeaveStep, StepRule> = {
	manager_review: { next: "hr_verification", role: "line_manager", departmentScoped: true },
	hr_verification: { next: "director_approval", role: "hr_officer", departmentScoped: false },
	director_approval: { next: "completed", role: "director", departmentScoped: false },
};

export function isLeaveStep(value: string): value is LeaveStep {
	return (LEAVE_STEPS as readonly string[]).includes(value);
}
