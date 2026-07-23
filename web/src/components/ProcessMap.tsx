import type { DFGEdge, DFGNode } from "../api";

export interface EdgeStat {
	median_ms: number;
	flagged: boolean;
}

interface Props {
	nodes: DFGNode[];
	edges: DFGEdge[];
	/** Per-pair duration stats ("a -> b"), used to label and color edges. */
	edgeStats?: Map<string, EdgeStat>;
}

export function formatDuration(ms: number): string {
	return ms >= 86_400_000 ? `${(ms / 86_400_000).toFixed(1)}d` : `${Math.max(1, Math.round(ms / 3_600_000))}h`;
}

const NODE_W = 150;
const NODE_H = 46;
const X_GAP = 280;
const Y_GAP = 90;

/** Layered layout: longest-path ranks from source nodes. Self-loops and cycles can't stall it. */
function layout(nodes: DFGNode[], edges: DFGEdge[]) {
	const incoming = new Set(edges.filter((e) => e.from !== e.to).map((e) => e.to));
	const adjacency = new Map<string, string[]>();
	for (const e of edges) {
		if (e.from === e.to) continue;
		adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);
	}

	const rank = new Map<string, number>();
	const queue: [string, number][] = nodes.filter((n) => !incoming.has(n.activity)).map((n) => [n.activity, 0]);
	while (queue.length > 0) {
		const [activity, r] = queue.shift()!;
		if ((rank.get(activity) ?? -1) >= r) continue;
		rank.set(activity, r);
		for (const next of adjacency.get(activity) ?? []) queue.push([next, r + 1]);
	}
	for (const n of nodes) if (!rank.has(n.activity)) rank.set(n.activity, 0);

	const byRank = new Map<number, string[]>();
	for (const n of nodes) {
		const r = rank.get(n.activity)!;
		byRank.set(r, [...(byRank.get(r) ?? []), n.activity]);
	}

	const pos = new Map<string, { x: number; y: number }>();
	for (const [r, activities] of byRank) {
		activities.forEach((activity, i) => pos.set(activity, { x: 20 + r * X_GAP, y: 30 + i * Y_GAP }));
	}

	const maxRank = Math.max(0, ...byRank.keys());
	const maxInRank = Math.max(1, ...[...byRank.values()].map((a) => a.length));
	return { pos, width: 20 + (maxRank + 1) * X_GAP + 40, height: 30 + maxInRank * Y_GAP + 20 };
}

export default function ProcessMap({ nodes, edges, edgeStats }: Props) {
	if (nodes.length === 0) return <p className="text-sm text-slate-400">No model yet — run the mining job.</p>;

	const { pos, width, height } = layout(nodes, edges);
	const maxEdge = Math.max(1, ...edges.map((e) => e.count));

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 400 }}>
			<defs>
				<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
					<path d="M2 1L8 5L2 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</marker>
			</defs>

			{edges.map((e, i) => {
				const a = pos.get(e.from)!;
				const b = pos.get(e.to)!;
				const stat = edgeStats?.get(`${e.from} -> ${e.to}`);
				const color = stat?.flagged ? "#dc2626" : "#94a3b8";
				const strokeWidth = 1 + (e.count / maxEdge) * 5;
				const label = stat ? `${e.count} · ${formatDuration(stat.median_ms)} median` : `${e.count}`;

				if (e.from === e.to) {
					// Self-loop arc above the node
					const cx = a.x + NODE_W / 2;
					const cy = a.y;
					return (
						<g key={i} style={{ color }}>
							<path
								d={`M ${cx - 20} ${cy} C ${cx - 20} ${cy - 40}, ${cx + 20} ${cy - 40}, ${cx + 20} ${cy}`}
								fill="none"
								stroke={color}
								strokeWidth={strokeWidth}
								markerEnd="url(#arrow)"
							/>
							<text x={cx} y={cy - 30} textAnchor="middle" fontSize="11" fill={color}>
								{label}
							</text>
						</g>
					);
				}

				const x1 = a.x + NODE_W;
				const y1 = a.y + NODE_H / 2;
				const x2 = b.x;
				const y2 = b.y + NODE_H / 2;
				const midX = (x1 + x2) / 2;
				return (
					<g key={i} style={{ color }}>
						<path
							d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
							fill="none"
							stroke={color}
							strokeWidth={strokeWidth}
							markerEnd="url(#arrow)"
						/>
						<text
							x={midX}
							y={(y1 + y2) / 2 - 8}
							textAnchor="middle"
							fontSize="11"
							fontWeight={stat?.flagged ? 700 : 400}
							fill={color}
							paintOrder="stroke"
							stroke="white"
							strokeWidth={4}
							strokeLinejoin="round"
						>
							{label}
						</text>
					</g>
				);
			})}

			{nodes.map((n) => {
				const p = pos.get(n.activity)!;
				const label = n.activity.length > 20 ? `${n.activity.slice(0, 19)}…` : n.activity;
				return (
					<g key={n.activity} transform={`translate(${p.x}, ${p.y})`}>
						<rect width={NODE_W} height={NODE_H} rx="8" fill="#1e293b" />
						<text x={NODE_W / 2} y={20} textAnchor="middle" fontSize="12" fontWeight="600" fill="white">
							{label}
						</text>
						<text x={NODE_W / 2} y={36} textAnchor="middle" fontSize="10" fill="#94a3b8">
							{n.count} events
						</text>
						<title>{n.activity}</title>
					</g>
				);
			})}
		</svg>
	);
}
