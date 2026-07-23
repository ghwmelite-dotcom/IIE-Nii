import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// Last event activity per leave case, derived from the event log (the source of
// truth, PRD §4) so seeded history counts too. rowid breaks timestamp ties
// (seeded approval + completed share a timestamp; insertion order is
// chronological). leave_type comes from each case's submission event — the
// post-supervisor step forks on it (study → RTDD, others → F&A).
const PIPELINE_SQL = `
SELECT e.activity,
       (SELECT json_extract(s.metadata, '$.leave_type') FROM events s
         WHERE s.case_id = e.case_id AND s.activity = 'leave_submitted' LIMIT 1) AS leave_type,
       COUNT(*) AS count
FROM events e
WHERE e.source_system = 'LEAVE_WORKFLOW'
  AND e.rowid = (SELECT MAX(rowid) FROM events WHERE case_id = e.case_id)
GROUP BY e.activity, leave_type`;

interface PipelineRow {
	activity: string;
	leave_type: string | null;
	count: number;
}

// Leave requests grouped by the step they're currently waiting at.
app.get("/leave-pipeline", async (c) => {
	const { results } = await c.env.DB.prepare(PIPELINE_SQL).all<PipelineRow>();
	const stages: Record<string, number> = {};
	for (const row of results) {
		// A case whose last event is activity X is waiting at the step after X.
		const waitingAt =
			row.activity === "leave_submitted"
				? "supervisor_review"
				: row.activity === "supervisor_review"
					? row.leave_type === "study"
						? "rtdd_review"
						: "fa_verification"
					: row.activity === "fa_verification"
						? "director_fa_approval"
						: row.activity === "rtdd_review"
							? "director_rtdd_approval"
							: row.activity; // completed | rejected | cancelled | escalated
		stages[waitingAt] = (stages[waitingAt] ?? 0) + row.count;
	}
	return c.json({ stages });
});

// Headline numbers for the operations dashboard.
app.get("/overview", async (c) => {
	const today = new Date().toISOString().slice(0, 10);
	const [employees, eventsTotal, eventsToday, perSource, flagged, pipeline, lastRun] = await Promise.all([
		c.env.DB.prepare("SELECT COUNT(*) AS n FROM employees").first<{ n: number }>(),
		c.env.DB.prepare("SELECT COUNT(*) AS n FROM events").first<{ n: number }>(),
		c.env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE "timestamp" >= ?`).bind(today).first<{ n: number }>(),
		c.env.DB.prepare(
			`SELECT source_system AS source, COUNT(*) AS total,
			        SUM(CASE WHEN "timestamp" >= ? THEN 1 ELSE 0 END) AS today
			 FROM events GROUP BY source_system`,
		)
			.bind(today)
			.all<{ source: string; total: number; today: number }>(),
		c.env.DB.prepare("SELECT COUNT(*) AS n FROM bottlenecks WHERE flagged = 1 AND period = (SELECT MAX(period) FROM bottlenecks)").first<{ n: number }>(),
		c.env.DB.prepare(PIPELINE_SQL).all<PipelineRow>(),
		c.env.DB.prepare("SELECT MAX(created_at) AS t FROM process_models").first<{ t: string | null }>(),
	]);

	let leaveOpen = 0;
	for (const row of pipeline.results) {
		if (["leave_submitted", "supervisor_review", "fa_verification", "director_fa_approval", "rtdd_review", "director_rtdd_approval", "escalated"].includes(row.activity)) {
			leaveOpen += row.count;
		}
	}

	return c.json({
		employees: employees?.n ?? 0,
		events_total: eventsTotal?.n ?? 0,
		events_today: eventsToday?.n ?? 0,
		sources: perSource.results,
		leave_open: leaveOpen,
		flagged_bottlenecks: flagged?.n ?? 0,
		last_mining_run: lastRun?.t ?? null,
	});
});

// Per-day attendance activity for the heatmap (PRD Phase 4, operations view).
app.get("/attendance-daily", async (c) => {
	const days = Math.min(Number(c.req.query("days") ?? 30) || 30, 90);
	const since = new Date(Date.now() - days * 86_400_000).toISOString();

	const { results: clockIns } = await c.env.DB.prepare(
		`SELECT substr("timestamp", 1, 10) AS date,
		        COUNT(*) AS clock_ins,
		        SUM(CASE WHEN json_extract(metadata, '$.late') = 1 THEN 1 ELSE 0 END) AS late
		 FROM events
		 WHERE activity = 'clock_in' AND "timestamp" >= ?
		 GROUP BY date ORDER BY date`,
	)
		.bind(since)
		.all<{ date: string; clock_ins: number; late: number | null }>();

	const { results: anomalies } = await c.env.DB.prepare(
		`SELECT substr("timestamp", 1, 10) AS date, COUNT(*) AS missing_out
		 FROM events
		 WHERE activity = 'anomaly_detected' AND "timestamp" >= ?
		 GROUP BY date`,
	)
		.bind(since)
		.all<{ date: string; missing_out: number }>();

	const anomalyByDate = new Map(anomalies.map((row) => [row.date, row.missing_out]));
	return c.json({
		days: clockIns.map((row) => ({ ...row, late: row.late ?? 0, missing_out: anomalyByDate.get(row.date) ?? 0 })),
	});
});

// Department comparison for the decision-support view (PRD §6.4): punctuality
// from clock-in events + average leave cycle time for completed cases.
app.get("/department-insights", async (c) => {
	const { results: punctuality } = await c.env.DB.prepare(
		`SELECT json_extract(metadata, '$.department') AS department,
		        COUNT(*) AS clock_ins,
		        SUM(CASE WHEN json_extract(metadata, '$.late') = 1 THEN 1 ELSE 0 END) AS late
		 FROM events WHERE activity = 'clock_in' AND json_extract(metadata, '$.department') IS NOT NULL
		 GROUP BY department`,
	).all<{ department: string; clock_ins: number; late: number | null }>();

	const { results: cycles } = await c.env.DB.prepare(
		`WITH terminal AS (
		     SELECT DISTINCT case_id FROM events
		     WHERE source_system = 'LEAVE_WORKFLOW' AND activity IN ('completed', 'rejected')
		 ),
		 spans AS (
		     SELECT e.case_id,
		            json_extract(MIN(e.metadata), '$.department') AS department,
		            (julianday(MAX(e."timestamp")) - julianday(MIN(e."timestamp"))) * 86400000.0 AS cycle_ms
		     FROM events e
		     WHERE e.source_system = 'LEAVE_WORKFLOW' AND e.case_id IN (SELECT case_id FROM terminal)
		     GROUP BY e.case_id
		 )
		 SELECT department, COUNT(*) AS cases, AVG(cycle_ms) AS avg_ms
		 FROM spans GROUP BY department`,
	).all<{ department: string; cases: number; avg_ms: number | null }>();

	const cycleByDept = new Map(cycles.map((row) => [row.department, row]));
	return c.json({
		departments: punctuality.map((row) => ({
			department: row.department,
			clock_ins: row.clock_ins,
			late_rate: row.clock_ins > 0 ? Math.round(((row.late ?? 0) / row.clock_ins) * 1000) / 1000 : 0,
			leave_cases: cycleByDept.get(row.department)?.cases ?? 0,
			avg_leave_days: cycleByDept.get(row.department)?.avg_ms != null ? Math.round((cycleByDept.get(row.department)!.avg_ms! / 86_400_000) * 10) / 10 : null,
		})),
	});
});

export default app;
