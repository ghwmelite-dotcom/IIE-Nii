/**
 * Bottleneck detection (PRD §6.2). Transition durations are computed in SQL
 * (window functions over the event log); percentiles and flagging run here.
 * Flag rule (PRD's "configurable threshold"): a pair is flagged when its median
 * duration exceeds the threshold configured for its source system. Thresholds
 * come from the CONFIG KV key "bottleneck_thresholds_ms", falling back to
 * DEFAULT_FLAG_THRESHOLDS_MS when unset.
 */

export interface BottleneckStat {
	source: string;
	pair: string;
	count: number;
	mean_ms: number;
	median_ms: number;
	p95_ms: number;
	max_ms: number;
	flagged: boolean;
}

const PAIR_DURATIONS_SQL = `
WITH ordered AS (
    SELECT source_system, case_id, activity, "timestamp",
           LEAD(activity)    OVER w AS next_activity,
           LEAD("timestamp") OVER w AS next_ts
    FROM events
    WINDOW w AS (PARTITION BY source_system, case_id ORDER BY "timestamp")
)
SELECT source_system AS source,
       activity || ' -> ' || next_activity AS pair,
       (julianday(next_ts) - julianday("timestamp")) * 86400000.0 AS duration_ms
FROM ordered
WHERE next_activity IS NOT NULL`;

interface PairDurationRow {
	source: string;
	pair: string;
	duration_ms: number | null;
}

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/** Flag pairs whose median duration exceeds the threshold for their source.
 *  Chat is deliberately unflagged: gaps between same-day queries are user
 *  think-time, not process delays. Overridable via the CONFIG KV key
 *  "bottleneck_thresholds_ms" (same shape); these are the defaults. */
export const DEFAULT_FLAG_THRESHOLDS_MS: Record<string, number> = {
	LEAVE_WORKFLOW: 2 * DAY_MS, // approvals should move within ~2 days
	ATTENDANCE: 12 * HOUR_MS, // clock_in -> clock_out beyond 12h is suspicious
};

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const rank = Math.ceil((p / 100) * sorted.length);
	return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export async function computeBottlenecks(
	db: D1Database,
	thresholds: Record<string, number> = DEFAULT_FLAG_THRESHOLDS_MS,
): Promise<BottleneckStat[]> {
	const { results } = await db.prepare(PAIR_DURATIONS_SQL).all<PairDurationRow>();

	const durationsByPair = new Map<string, { source: string; pair: string; durations: number[] }>();
	for (const row of results) {
		if (row.duration_ms === null || row.duration_ms < 0) continue;
		const key = `${row.source}|${row.pair}`;
		let entry = durationsByPair.get(key);
		if (!entry) {
			entry = { source: row.source, pair: row.pair, durations: [] };
			durationsByPair.set(key, entry);
		}
		entry.durations.push(row.duration_ms);
	}

	const stats: BottleneckStat[] = [...durationsByPair.values()].map(({ source, pair, durations }) => {
		durations.sort((a, b) => a - b);
		const sum = durations.reduce((acc, v) => acc + v, 0);
		return {
			source,
			pair,
			count: durations.length,
			mean_ms: Math.round(sum / durations.length),
			median_ms: Math.round(percentile(durations, 50)),
			p95_ms: Math.round(percentile(durations, 95)),
			max_ms: Math.round(durations[durations.length - 1]),
			flagged: false,
		};
	});

	for (const s of stats) {
		const threshold = thresholds[s.source];
		s.flagged = threshold !== undefined && s.median_ms > threshold;
	}

	return stats.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.p95_ms - a.p95_ms);
}
