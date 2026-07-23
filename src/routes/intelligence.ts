import { Hono } from "hono";
import { runMiningJob } from "../mining/job";
import { generateRecommendations } from "../lib/recommendations";

const app = new Hono<{ Bindings: Env }>();

interface ModelRow {
	model_id: string;
	source: string;
	graph_json: string;
	variant_json: string;
	case_count: number;
	event_count: number;
	created_at: string;
}

interface BottleneckRow {
	id: string;
	activity_pair: string;
	source: string;
	count: number;
	mean_ms: number;
	median_ms: number;
	p95_ms: number;
	max_ms: number;
	flagged: number;
	period: string;
}

interface ConformanceRow {
	id: string;
	case_id: string;
	deviation_type: string;
	description: string;
	score: number;
	detected_at: string;
}

// Latest discovered process model per source system (PRD §10).
app.get("/process-map", async (c) => {
	const source = c.req.query("source");
	const sql = `
		SELECT * FROM process_models p
		WHERE created_at = (SELECT MAX(created_at) FROM process_models WHERE source = p.source)
		${source ? "AND source = ?" : ""}
		ORDER BY source`;
	const stmt = c.env.DB.prepare(sql);
	const { results } = await (source ? stmt.bind(source) : stmt).all<ModelRow>();

	const models = results.map((row) => ({
		...row,
		graph: JSON.parse(row.graph_json) as unknown,
		variants: JSON.parse(row.variant_json) as unknown,
		graph_json: undefined,
		variant_json: undefined,
	}));
	return c.json({ models });
});

// Bottleneck stats from the latest mining run, flagged pairs first (PRD §10).
app.get("/bottlenecks", async (c) => {
	const source = c.req.query("source");
	const sql = `
		SELECT * FROM bottlenecks
		WHERE period = (SELECT MAX(period) FROM bottlenecks)
		${source ? "AND source = ?" : ""}
		ORDER BY flagged DESC, p95_ms DESC`;
	const stmt = c.env.DB.prepare(sql);
	const { results } = await (source ? stmt.bind(source) : stmt).all<BottleneckRow>();

	return c.json({
		period: results[0]?.period ?? null,
		bottlenecks: results.map((row) => ({ ...row, flagged: row.flagged === 1 })),
	});
});

// Conformance deviations from the latest mining run, worst score first (PRD §10).
app.get("/conformance", async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT * FROM conformance_results
		 WHERE detected_at = (SELECT MAX(detected_at) FROM conformance_results)
		 ORDER BY score ASC, case_id`,
	).all<ConformanceRow>();

	const byType: Record<string, number> = {};
	for (const row of results) {
		byType[row.deviation_type] = (byType[row.deviation_type] ?? 0) + 1;
	}
	const avgScore = results.length
		? Math.round((results.reduce((acc, row) => acc + row.score, 0) / results.length) * 100) / 100
		: null;

	return c.json({
		detected_at: results[0]?.detected_at ?? null,
		summary: { deviations: results.length, avg_score: avgScore, by_type: byType },
		deviations: results,
	});
});

// On-demand mining run (same code path as the cron trigger).
app.post("/run", async (c) => {
	const summary = await runMiningJob(c.env);
	return c.json(summary);
});

// Rule-based decision-support feed (PRD §6.4, §10).
app.get("/recommendations", async (c) => {
	const recommendations = await generateRecommendations(c.env);
	return c.json({ generated_at: new Date().toISOString(), recommendations });
});

export default app;
