/**
 * Conformance checking (PRD §6.3). Compares each leave-workflow trace against
 * the prescribed process model. Two deviation types: skipped_step (a required
 * activity never occurs) and out_of_order (required activities occur in the
 * wrong sequence). Score = fraction of expected steps present and ordered.
 *
 * The prescribed model lives in code for now; PRD moves it to KV config later.
 */

import type { TraceEvent } from "./graph";

export const PRESCRIBED_LEAVE = [
	"leave_submitted",
	"manager_review",
	"hr_verification",
	"director_approval",
	"completed",
] as const;

export interface Deviation {
	case_id: string;
	deviation_type: "skipped_step" | "out_of_order";
	description: string;
	score: number;
}

const TERMINAL_ACTIVITIES = new Set(["completed", "rejected", "cancelled"]);

/** events must arrive ordered by case_id, then timestamp. */
export function checkLeaveConformance(events: TraceEvent[]): Deviation[] {
	const traces = new Map<string, string[]>();
	for (const e of events) {
		const trace = traces.get(e.case_id);
		if (trace) {
			trace.push(e.activity);
		} else {
			traces.set(e.case_id, [e.activity]);
		}
	}

	const deviations: Deviation[] = [];
	for (const [caseId, activities] of traces) {
		// In-flight cases haven't finished — not yet judgeable as deviations.
		if (!TERMINAL_ACTIVITIES.has(activities[activities.length - 1])) continue;
		deviations.push(...checkTrace(caseId, activities));
	}
	return deviations;
}

function checkTrace(caseId: string, activities: string[]): Deviation[] {
	// Cancellation is a legitimate exit by the requester, not a process deviation.
	if (activities.includes("cancelled")) return [];

	const expected = expectedSequence(activities);
	const present = new Set(activities);

	const deviations: Deviation[] = [];

	const missing = expected.filter((step) => !present.has(step));
	for (const step of missing) {
		deviations.push({
			case_id: caseId,
			deviation_type: "skipped_step",
			description: `Prescribed step '${step}' never occurred`,
			score: 0, // filled in below
		});
	}

	const presentExpected = expected.filter((step) => present.has(step));
	const positions = presentExpected.map((step) => activities.indexOf(step));
	const inOrder = positions.every((pos, i) => i === 0 || positions[i - 1] < pos);
	if (!inOrder) {
		deviations.push({
			case_id: caseId,
			deviation_type: "out_of_order",
			description: `Steps executed out of prescribed order: ${activities.join(" → ")}`,
			score: 0,
		});
	}

	if (deviations.length === 0) return [];

	const score =
		Math.round(((expected.length - missing.length - (inOrder ? 0 : 1)) / expected.length) * 100) / 100;
	return deviations.map((d) => ({ ...d, score: Math.max(0, score) }));
}

/** The steps a trace should contain, given how it ended. */
function expectedSequence(activities: string[]): string[] {
	if (!activities.includes("rejected")) return [...PRESCRIBED_LEAVE];
	// For rejected cases only the steps up to the rejecting step are expected.
	const rejectIdx = activities.lastIndexOf("rejected");
	const rejectingStep = rejectIdx > 0 ? activities[rejectIdx - 1] : null;
	const cutIdx = (PRESCRIBED_LEAVE as readonly string[]).indexOf(rejectingStep ?? "");
	return [...PRESCRIBED_LEAVE.slice(0, Math.max(0, cutIdx) + 1), "rejected"];
}
