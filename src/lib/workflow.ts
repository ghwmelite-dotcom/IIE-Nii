/**
 * Leave approval state machine (PRD §5.3).
 *
 * Standard types (annual, sick, maternity, casual) — administered by F&A at OHCS:
 *   submitted → supervisor_review → fa_verification → director_fa_approval → completed
 * Study leave (OHCS and the wider Civil Service) — administered by RTDD:
 *   submitted → supervisor_review → rtdd_review → director_rtdd_approval → completed
 *
 * supervisor_review is always the officer's own-unit supervisor (Assistant/Deputy
 * Director). Verification sits with the administering directorate: F&A's admin
 * officer for standard leave, RTDD's schedule officer for study leave — and each
 * is approved by that directorate's Director.
 *
 * Any step may instead reject (with reason); the requester may cancel while pending.
 * Activity names double as the event activities the mining conformance checker
 * expects (src/mining/conformance.ts) — keep them in sync.
 */

export const LEAVE_STEPS = ["supervisor_review", "fa_verification", "director_fa_approval", "rtdd_review", "director_rtdd_approval"] as const;
export type LeaveStep = (typeof LEAVE_STEPS)[number];

export type ActorRole = "line_manager" | "hr_officer" | "director" | "admin_officer" | "schedule_officer";

/** Study leave is reviewed by RTDD's Schedule Officer and approved by Director RTDD. */
export const STUDY_LEAVE_TYPE = "study";
export const STUDY_DIRECTORATE = "RTDD";
/** All other leave is verified by F&A's admin officer and approved by Director F&A. */
export const ADMIN_DIRECTORATE = "F&A";

export interface StepRule {
	/** Next step; for supervisor_review it forks on the leave type. */
	next: LeaveStep | "completed" | ((leaveType: string) => LeaveStep);
	role: ActorRole;
	/** Actor must belong to the requester's own department. */
	departmentScoped?: boolean;
	/** Actor must belong to this fixed department (F&A / RTDD). */
	departmentId?: string;
}

export const STEP_RULES: Record<LeaveStep, StepRule> = {
	supervisor_review: {
		next: (leaveType) => (leaveType === STUDY_LEAVE_TYPE ? "rtdd_review" : "fa_verification"),
		role: "line_manager",
		departmentScoped: true,
	},
	fa_verification: { next: "director_fa_approval", role: "admin_officer", departmentId: ADMIN_DIRECTORATE },
	director_fa_approval: { next: "completed", role: "director", departmentId: ADMIN_DIRECTORATE },
	rtdd_review: { next: "director_rtdd_approval", role: "schedule_officer", departmentId: STUDY_DIRECTORATE },
	director_rtdd_approval: { next: "completed", role: "director", departmentId: STUDY_DIRECTORATE },
};

export function nextStep(step: LeaveStep, leaveType: string): LeaveStep | "completed" {
	const next = STEP_RULES[step].next;
	return typeof next === "function" ? next(leaveType) : next;
}

/** The full prescribed activity chain for a leave type (conformance reference). */
export function prescribedChain(leaveType: string): string[] {
	return leaveType === STUDY_LEAVE_TYPE
		? ["leave_submitted", "supervisor_review", "rtdd_review", "director_rtdd_approval", "completed"]
		: ["leave_submitted", "supervisor_review", "fa_verification", "director_fa_approval", "completed"];
}

export function isLeaveStep(value: string): value is LeaveStep {
	return (LEAVE_STEPS as readonly string[]).includes(value);
}
