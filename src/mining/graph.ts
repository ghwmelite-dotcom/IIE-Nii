/**
 * Directly-follows graph (DFG) construction — heuristic-miner-lite (PRD §6.1).
 * Frequency counts per node/edge plus the heuristic-miner dependency measure
 * (a→b − b→a) / (a→b + b→a + 1). Length-1/length-2 loop handling is
 * deliberately omitted until real data demands it.
 */

export interface TraceEvent {
	case_id: string;
	activity: string;
	timestamp: string;
}

export interface DFGNode {
	activity: string;
	count: number;
}

export interface DFGEdge {
	from: string;
	to: string;
	count: number;
	dependency: number;
}

export interface Variant {
	activities: string[];
	count: number;
}

export interface ProcessModel {
	nodes: DFGNode[];
	edges: DFGEdge[];
	variants: Variant[];
	caseCount: number;
	eventCount: number;
}

const MAX_VARIANTS = 10;

/** events must arrive ordered by case_id, then timestamp (the SQL in job.ts guarantees this). */
export function buildModel(events: TraceEvent[]): ProcessModel {
	const nodeCount = new Map<string, number>();
	const edgeCount = new Map<string, number>();
	const variantCount = new Map<string, number>();

	let caseCount = 0;
	let prevCase: string | null = null;
	let prevActivity: string | null = null;
	let signature: string[] = [];

	const closeTrace = () => {
		if (prevCase !== null) {
			const key = signature.join("→");
			variantCount.set(key, (variantCount.get(key) ?? 0) + 1);
		}
	};

	for (const e of events) {
		if (e.case_id !== prevCase) {
			closeTrace();
			caseCount++;
			prevCase = e.case_id;
			prevActivity = null;
			signature = [];
		}
		nodeCount.set(e.activity, (nodeCount.get(e.activity) ?? 0) + 1);
		if (prevActivity !== null) {
			const key = `${prevActivity} -> ${e.activity}`;
			edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
		}
		signature.push(e.activity);
		prevActivity = e.activity;
	}
	closeTrace();

	const nodes: DFGNode[] = [...nodeCount.entries()]
		.map(([activity, count]) => ({ activity, count }))
		.sort((a, b) => b.count - a.count);

	const edges: DFGEdge[] = [...edgeCount.entries()]
		.map(([key, count]) => {
			const [from, to] = key.split(" -> ");
			const reverse = edgeCount.get(`${to} -> ${from}`) ?? 0;
			const dependency = Math.round(((count - reverse) / (count + reverse + 1)) * 1000) / 1000;
			return { from, to, count, dependency };
		})
		.sort((a, b) => b.count - a.count);

	const variants: Variant[] = [...variantCount.entries()]
		.map(([key, count]) => ({ activities: key.split("→"), count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, MAX_VARIANTS);

	return { nodes, edges, variants, caseCount, eventCount: events.length };
}
