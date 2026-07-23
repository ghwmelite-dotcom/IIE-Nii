import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// Last event activity per leave case, derived from the event log (the source of
// truth, PRD §4) so seeded history counts too. rowid breaks timestamp ties
// (seeded director_approval + completed share a timestamp; insertion order is
// chronological).
const PIPELINE_SQL = `
SELECT e.activity, COUNT(*) AS count
FROM events e
WHERE e.source_system = 'LEAVE_WORKFLOW'
  AND e.rowid = (SELECT MAX(rowid) FROM events WHERE case_id = e.case_id)
GROUP BY e.activity`;

interface PipelineRow {
	activity: string;
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
				? "manager_review"
				: row.activity === "manager_review"
					? "hr_verification"
					: row.activity === "hr_verification"
						? "director_approval"
						: row.activity; // completed | rejected | cancelled | escalated
		stages[waitingAt] = (stages[waitingAt] ?? 0) + row.count;
	}
	return c.json({ stages });
});

// Headline numbers for the operations dashboard.
app.get("/overview", async (c) => {
	const today = new Date().toISOString().slice(0, 10);
	const [employees, eventsTotal, eventsToday, flagged, pipeline, lastRun] = await Promise.all([
		c.env.DB.prepare("SELECT COUNT(*) AS n FROM employees").first<{ n: number }>(),
		c.env.DB.prepare("SELECT COUNT(*) AS n FROM events").first<{ n: number }>(),
		c.env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE "timestamp" >= ?`).bind(today).first<{ n: number }>(),
		c.env.DB.prepare("SELECT COUNT(*) AS n FROM bottlenecks WHERE flagged = 1 AND period = (SELECT MAX(period) FROM bottlenecks)").first<{ n: number }>(),
		c.env.DB.prepare(PIPELINE_SQL).all<PipelineRow>(),
		c.env.DB.prepare("SELECT MAX(created_at) AS t FROM process_models").first<{ t: string | null }>(),
	]);

	let leaveOpen = 0;
	for (const row of pipeline.results) {
		if (["leave_submitted", "manager_review", "hr_verification", "director_approval", "escalated"].includes(row.activity)) {
			leaveOpen += row.count;
		}
	}

	return c.json({
		employees: employees?.n ?? 0,
		events_total: eventsTotal?.n ?? 0,
		events_today: eventsToday?.n ?? 0,
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

export default app;
