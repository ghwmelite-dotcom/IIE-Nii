/**
 * Mining job orchestrator (PRD §4.2, §6). Runs on a 6-hourly cron trigger and
 * on demand via POST /api/intelligence/run. Reads the whole event log (fine at
 * OHCS scale; partition by month when the log grows — PRD §12), builds one
 * process model per source system, computes bottleneck stats, and checks
 * leave-workflow conformance. Results are appended with the run timestamp so
 * readers always select the latest run.
 */

import { buildModel } from "./graph";
import type { TraceEvent } from "./graph";
import { computeBottlenecks } from "./bottlenecks";
import { checkLeaveConformance } from "./conformance";

export interface MiningSummary {
	ran_at: string;
	sources: { source: string; cases: number; events: number; edges: number; variants: number }[];
	bottleneck_pairs: number;
	flagged_pairs: number;
	deviations: number;
	duration_ms: number;
}

const EVENTS_SQL = `SELECT case_id, activity, source_system, "timestamp" FROM events ORDER BY source_system, case_id, "timestamp"`;

interface EventQueryRow {
	case_id: string;
	activity: string;
	source_system: string;
	timestamp: string;
}

const INSERT_CHUNK = 50;

export async function runMiningJob(env: Env): Promise<MiningSummary> {
	const started = Date.now();
	const ranAt = new Date(started).toISOString();

	const { results } = await env.DB.prepare(EVENTS_SQL).all<EventQueryRow>();

	// Rows arrive ordered by source_system, so groups are contiguous.
	const bySource = new Map<string, TraceEvent[]>();
	for (const row of results) {
		let group = bySource.get(row.source_system);
		if (!group) {
			group = [];
			bySource.set(row.source_system, group);
		}
		group.push({ case_id: row.case_id, activity: row.activity, timestamp: row.timestamp });
	}

	const statements: D1PreparedStatement[] = [];
	const sources: MiningSummary["sources"] = [];

	for (const [source, events] of bySource) {
		const model = buildModel(events);
		sources.push({
			source,
			cases: model.caseCount,
			events: model.eventCount,
			edges: model.edges.length,
			variants: model.variants.length,
		});
		statements.push(
			env.DB.prepare(
				`INSERT INTO process_models (model_id, source, graph_json, variant_json, case_count, event_count, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				crypto.randomUUID(),
				source,
				JSON.stringify({ nodes: model.nodes, edges: model.edges }),
				JSON.stringify(model.variants),
				model.caseCount,
				model.eventCount,
				ranAt,
			),
		);
	}

	const bottlenecks = await computeBottlenecks(env.DB);
	for (const b of bottlenecks) {
		statements.push(
			env.DB.prepare(
				`INSERT INTO bottlenecks (id, activity_pair, source, count, mean_ms, median_ms, p95_ms, max_ms, flagged, period)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(crypto.randomUUID(), b.pair, b.source, b.count, b.mean_ms, b.median_ms, b.p95_ms, b.max_ms, b.flagged ? 1 : 0, ranAt),
		);
	}

	const deviations = checkLeaveConformance(bySource.get("LEAVE_WORKFLOW") ?? []);
	for (const d of deviations) {
		statements.push(
			env.DB.prepare(
				`INSERT INTO conformance_results (id, case_id, deviation_type, description, score, detected_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			).bind(crypto.randomUUID(), d.case_id, d.deviation_type, d.description, d.score, ranAt),
		);
	}

	for (let i = 0; i < statements.length; i += INSERT_CHUNK) {
		await env.DB.batch(statements.slice(i, i + INSERT_CHUNK));
	}

	const summary: MiningSummary = {
		ran_at: ranAt,
		sources,
		bottleneck_pairs: bottlenecks.length,
		flagged_pairs: bottlenecks.filter((b) => b.flagged).length,
		deviations: deviations.length,
		duration_ms: Date.now() - started,
	};
	console.log(JSON.stringify({ message: "mining job completed", ...summary }));
	return summary;
}
