/**
 * Period report aggregation (PRD §6.5).
 * Builds a snapshot data object for weekly / monthly / yearly windows.
 */

import { generateRecommendations, type Recommendation } from "./recommendations";

export type ReportPeriod = "weekly" | "monthly" | "yearly";
const WINDOW_DAYS: Record<ReportPeriod, number> = { weekly: 7, monthly: 30, yearly: 365 };

export interface ReportData {
	meta: { period: ReportPeriod; start: string; end: string; generated_at: string };
	summary: {
		employees: number;
		events: number;
		leave_submitted: number;
		leave_completed: number;
		avg_leave_cycle_days: number | null;
		late_rate: number;
	};
	attendance: {
		clock_ins: number;
		late: number;
		late_rate: number;
		by_department: { department: string; clock_ins: number; late: number; late_rate: number }[];
	};
	leave: {
		submitted: number;
		completed: number;
		rejected: number;
		cancelled: number;
		avg_cycle_days: number | null;
		by_type: { type: string; count: number }[];
	};
	process: {
		flagged_bottlenecks: number;
		top_bottleneck: string | null;
		conformance_rate: number | null;
		variant_count: number;
	};
	recommendations: Recommendation[];
}

interface AttendanceAggRow {
	clock_ins: number;
	late: number;
}

interface AttendanceByDeptRow {
	department: string;
	clock_ins: number;
	late: number;
}

interface LeaveAggRow {
	submitted: number;
	completed: number;
	rejected: number;
	cancelled: number;
}

interface LeaveByTypeRow {
	type: string;
	count: number;
}

interface LeaveCycleRow {
	request_id: string;
	created_at: string;
	completed_at: string;
}

interface EmployeeCountRow {
	count: number;
}

interface EventCountRow {
	count: number;
}

interface BottleneckFlaggedRow {
	flagged_count: number;
	top_bottleneck: string | null;
}

interface ConformanceRow {
	deviation_count: number;
}

interface ProcessModelRow {
	variant_json: string;
	case_count: number;
}

export async function buildReport(
	env: Env,
	period: ReportPeriod,
	ref: string = new Date().toISOString(),
): Promise<ReportData> {
	const end = new Date(ref);
	const start = new Date(end.getTime() - WINDOW_DAYS[period] * 86_400_000);
	const startIso = start.toISOString();
	const endIso = end.toISOString();
	const startDate = startIso.slice(0, 10); // for attendance_records.date comparisons
	const endDate = endIso.slice(0, 10);

	// ── Attendance ────────────────────────────────────────────────────────────
	const { results: attAggRows } = await env.DB.prepare(
		`SELECT
			COUNT(*) AS clock_ins,
			SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late
		FROM attendance_records
		WHERE date >= ? AND date < ?`,
	)
		.bind(startDate, endDate)
		.all<AttendanceAggRow>();

	const attAgg = attAggRows[0] ?? { clock_ins: 0, late: 0 };
	const clockIns = attAgg.clock_ins ?? 0;
	const lateCount = attAgg.late ?? 0;
	const lateRate = clockIns > 0 ? lateCount / clockIns : 0;

	const { results: attByDeptRows } = await env.DB.prepare(
		`SELECT
			e.department_id AS department,
			COUNT(*) AS clock_ins,
			SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) AS late
		FROM attendance_records ar
		JOIN employees e ON e.employee_id = ar.employee_id
		WHERE ar.date >= ? AND ar.date < ?
		GROUP BY e.department_id
		HAVING COUNT(*) > 0`,
	)
		.bind(startDate, endDate)
		.all<AttendanceByDeptRow>();

	const byDepartment = attByDeptRows.map((row) => {
		const dClockIns = row.clock_ins ?? 0;
		const dLate = row.late ?? 0;
		return {
			department: row.department,
			clock_ins: dClockIns,
			late: dLate,
			late_rate: dClockIns > 0 ? dLate / dClockIns : 0,
		};
	});

	// ── Leave ─────────────────────────────────────────────────────────────────
	const { results: leaveAggRows } = await env.DB.prepare(
		`SELECT
			COUNT(*) AS submitted,
			SUM(CASE WHEN status = 'completed'  THEN 1 ELSE 0 END) AS completed,
			SUM(CASE WHEN status = 'rejected'   THEN 1 ELSE 0 END) AS rejected,
			SUM(CASE WHEN status = 'cancelled'  THEN 1 ELSE 0 END) AS cancelled
		FROM leave_requests
		WHERE created_at >= ? AND created_at < ?`,
	)
		.bind(startIso, endIso)
		.all<LeaveAggRow>();

	const leaveAgg = leaveAggRows[0] ?? { submitted: 0, completed: 0, rejected: 0, cancelled: 0 };
	const leaveSubmitted = leaveAgg.submitted ?? 0;
	const leaveCompleted = leaveAgg.completed ?? 0;
	const leaveRejected = leaveAgg.rejected ?? 0;
	const leaveCancelled = leaveAgg.cancelled ?? 0;

	// avg_cycle_days: for completed requests in window, compute (latest 'completed' transition - created_at) in JS
	const { results: cycleRows } = await env.DB.prepare(
		`SELECT lr.request_id, lr.created_at, MAX(wt."timestamp") AS completed_at
		FROM leave_requests lr
		JOIN workflow_transitions wt ON wt.request_id = lr.request_id AND wt.to_step = 'completed'
		WHERE lr.created_at >= ? AND lr.created_at < ? AND lr.status = 'completed'
		GROUP BY lr.request_id, lr.created_at`,
	)
		.bind(startIso, endIso)
		.all<LeaveCycleRow>();

	let avgCycleDays: number | null = null;
	if (cycleRows.length > 0) {
		const totalDays = cycleRows.reduce((sum, row) => {
			const diffMs = Date.parse(row.completed_at) - Date.parse(row.created_at);
			return sum + diffMs / 86_400_000;
		}, 0);
		avgCycleDays = totalDays / cycleRows.length;
	}

	const { results: byTypeRows } = await env.DB.prepare(
		`SELECT type, COUNT(*) AS count
		FROM leave_requests
		WHERE created_at >= ? AND created_at < ?
		GROUP BY type`,
	)
		.bind(startIso, endIso)
		.all<LeaveByTypeRow>();

	// ── Summary ───────────────────────────────────────────────────────────────
	const { results: empCountRows } = await env.DB.prepare(
		`SELECT COUNT(*) AS count FROM employees`,
	).all<EmployeeCountRow>();

	const { results: eventCountRows } = await env.DB.prepare(
		`SELECT COUNT(*) AS count FROM events WHERE "timestamp" >= ? AND "timestamp" < ?`,
	)
		.bind(startIso, endIso)
		.all<EventCountRow>();

	const employeeCount = empCountRows[0]?.count ?? 0;
	const eventCount = eventCountRows[0]?.count ?? 0;

	// ── Process (NOT windowed — latest snapshot) ──────────────────────────────
	const { results: bottleneckRows } = await env.DB.prepare(
		`SELECT
			COUNT(*) AS flagged_count,
			(SELECT activity_pair FROM bottlenecks
			 WHERE period = (SELECT MAX(period) FROM bottlenecks) AND flagged = 1
			 ORDER BY p95_ms DESC LIMIT 1) AS top_bottleneck
		FROM bottlenecks
		WHERE period = (SELECT MAX(period) FROM bottlenecks) AND flagged = 1`,
	).all<BottleneckFlaggedRow>();

	const flaggedBottlenecks = bottleneckRows[0]?.flagged_count ?? 0;
	const topBottleneck = bottleneckRows[0]?.top_bottleneck ?? null;

	const { results: conformanceRows } = await env.DB.prepare(
		`SELECT COUNT(*) AS deviation_count
		FROM conformance_results
		WHERE detected_at = (SELECT MAX(detected_at) FROM conformance_results)`,
	).all<ConformanceRow>();

	const { results: modelRows } = await env.DB.prepare(
		`SELECT variant_json, case_count
		FROM process_models
		WHERE source = 'LEAVE_WORKFLOW'
		  AND created_at = (SELECT MAX(created_at) FROM process_models WHERE source = 'LEAVE_WORKFLOW')`,
	).all<ProcessModelRow>();

	const deviationCount = conformanceRows[0]?.deviation_count ?? 0;
	const modelCaseCount = modelRows[0]?.case_count ?? 0;
	let conformanceRate: number | null = null;
	if (modelCaseCount > 0 && conformanceRows.length > 0) {
		conformanceRate = 1 - deviationCount / modelCaseCount;
	}

	let variantCount = 0;
	if (modelRows[0]) {
		try {
			const variants = JSON.parse(modelRows[0].variant_json) as unknown[];
			variantCount = Array.isArray(variants) ? variants.length : 0;
		} catch {
			variantCount = 0;
		}
	}

	// ── Recommendations ───────────────────────────────────────────────────────
	const recommendations = await generateRecommendations(env);

	// ── Assemble ──────────────────────────────────────────────────────────────
	return {
		meta: {
			period,
			start: startIso,
			end: endIso,
			generated_at: new Date().toISOString(),
		},
		summary: {
			employees: employeeCount,
			events: eventCount,
			leave_submitted: leaveSubmitted,
			leave_completed: leaveCompleted,
			avg_leave_cycle_days: avgCycleDays,
			late_rate: lateRate,
		},
		attendance: {
			clock_ins: clockIns,
			late: lateCount,
			late_rate: lateRate,
			by_department: byDepartment,
		},
		leave: {
			submitted: leaveSubmitted,
			completed: leaveCompleted,
			rejected: leaveRejected,
			cancelled: leaveCancelled,
			avg_cycle_days: avgCycleDays,
			by_type: byTypeRows,
		},
		process: {
			flagged_bottlenecks: flaggedBottlenecks,
			top_bottleneck: topBottleneck,
			conformance_rate: conformanceRate,
			variant_count: variantCount,
		},
		recommendations,
	};
}
