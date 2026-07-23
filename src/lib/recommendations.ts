/**
 * Rule-based decision support (PRD §6.4). Combines the latest bottleneck,
 * conformance, and variant data into actionable recommendations. The Workers
 * AI narrative layer replaces/augments these rules in a later phase.
 */

export interface Recommendation {
	kind: "bottleneck" | "conformance" | "variability";
	severity: "high" | "medium" | "low";
	title: string;
	detail: string;
}

interface BottleneckRow {
	activity_pair: string;
	source: string;
	count: number;
	median_ms: number;
	p95_ms: number;
	flagged: number;
}

interface ConformanceRow {
	deviation_type: string;
	description: string;
	case_id: string;
}

const DAY = 86_400_000;

export async function generateRecommendations(env: Env): Promise<Recommendation[]> {
	const recommendations: Recommendation[] = [];

	const { results: bottlenecks } = await env.DB.prepare(
		`SELECT activity_pair, source, count, median_ms, p95_ms, flagged
		 FROM bottlenecks WHERE period = (SELECT MAX(period) FROM bottlenecks) ORDER BY p95_ms DESC`,
	).all<BottleneckRow>();

	for (const b of bottlenecks.filter((row) => row.flagged === 1)) {
		const medianDays = (b.median_ms / DAY).toFixed(1);
		const p95Days = (b.p95_ms / DAY).toFixed(1);
		recommendations.push({
			kind: "bottleneck",
			severity: b.p95_ms > 2 * b.median_ms ? "high" : "medium",
			title: `Slow step: ${b.activity_pair}`,
			detail: `Median ${medianDays}d, P95 ${p95Days}d across ${b.count} cases — the slowest transition in ${b.source.toLowerCase().replace("_", " ")}. Consider a backup approver or SLA alerts for this step.`,
		});
	}

	const { results: deviations } = await env.DB.prepare(
		`SELECT deviation_type, description, case_id FROM conformance_results
		 WHERE detected_at = (SELECT MAX(detected_at) FROM conformance_results)`,
	).all<ConformanceRow>();
	const { results: modelRows } = await env.DB.prepare(
		`SELECT variant_json, case_count FROM process_models
		 WHERE source = 'LEAVE_WORKFLOW' AND created_at = (SELECT MAX(created_at) FROM process_models WHERE source = 'LEAVE_WORKFLOW')`,
	).all<{ variant_json: string; case_count: number }>();

	const caseCount = modelRows[0]?.case_count ?? 0;
	if (deviations.length > 0 && caseCount > 0) {
		const rate = deviations.length / caseCount;
		const skippedManager = deviations.filter((d) => d.description.includes("manager_review")).length;
		recommendations.push({
			kind: "conformance",
			severity: rate > 0.1 ? "high" : rate > 0.05 ? "medium" : "low",
			title: `${deviations.length} of ${caseCount} cases deviate from the prescribed workflow`,
			detail:
				skippedManager > 0
					? `${skippedManager} case(s) bypassed line-manager review entirely. Enforce routing at submission or audit the affected departments.`
					: `Review the ${deviations.length} flagged case(s) for out-of-order execution.`,
		});
	}

	if (modelRows[0]) {
		const variants = JSON.parse(modelRows[0].variant_json) as { activities: string[]; count: number }[];
		let covered = 0;
		let variantsFor80 = 0;
		for (const v of variants) {
			if (covered >= caseCount * 0.8) break;
			covered += v.count;
			variantsFor80++;
		}
		if (variantsFor80 > 0 && variants.length > variantsFor80) {
			recommendations.push({
				kind: "variability",
				severity: "low",
				title: `${variantsFor80} workflow variant(s) account for 80% of cases`,
				detail: `The remaining ${variants.length - variantsFor80} variant(s) are rare — consider simplifying or explicitly permitting them in policy.`,
			});
		}
	}

	return recommendations;
}
