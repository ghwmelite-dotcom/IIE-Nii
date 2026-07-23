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

const NODE_W = 160;
const NODE_H = 52;
const X_GAP = 300;
const Y_GAP = 100;

function accentFor(activity: string): string {
	if (activity === "rejected" || activity === "cancelled") return "#e11d48";
	if (activity === "completed") return "#059669";
	if (activity === "leave_submitted" || activity === "clock_in") return "#4f46e5";
	return "#334155";
}

export function formatDuration(ms: number): string {
	return ms >= 86_400_000 ? `${(ms / 86_400_000).toFixed(1)}d` : `${Math.max(1, Math.round(ms / 3_600_000))}h`;
}

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
		activities.forEach((activity, i) => pos.set(activity, { x: 40 + r * X_GAP, y: 50 + i * Y_GAP }));
	}

	const maxNodeBottom = Math.max(...[...pos.values()].map((p) => p.y)) + NODE_H;
	return { pos, width: 40 + Math.max(0, ...byRank.keys()) * X_GAP + NODE_W + 60, height: maxNodeBottom + 50 };
}

/** Off-the-line label: a small pill floating clear of the edge it describes. */
function EdgeLabel({ x, y, text, flagged }: { x: number; y: number; text: string; flagged: boolean }) {
	const w = text.length * 6.2 + 18;
	return (
		<g transform={`translate(${x}, ${y})`}>
			<rect
				x={-w / 2}
				y={-11}
				width={w}
				height={21}
				rx={10.5}
				fill={flagged ? "#dc2626" : "white"}
				stroke={flagged ? "#b91c1c" : "#e2e8f0"}
				strokeWidth={1}
			/>
			<text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={flagged ? 600 : 500} fill={flagged ? "white" : "#475569"}>
				{text}
			</text>
			<title>{flagged ? "Over SLA threshold — " : ""}{text}</title>
		</g>
	);
}

export default function ProcessMap({ nodes, edges, edgeStats }: Props) {
	if (nodes.length === 0) return <p className="text-sm text-slate-400">No model yet — run the mining job.</p>;

	const { pos, width, height } = layout(nodes, edges);
	const maxEdge = Math.max(1, ...edges.map((e) => e.count));

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 480 }}>
			<defs>
				<pattern id="map-dots" width="26" height="26" patternUnits="userSpaceOnUse">
					<circle cx="1.5" cy="1.5" r="1.5" fill="#eef2f7" />
				</pattern>
				<marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M2 1L8 5L2 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
				</marker>
			</defs>

			<rect width={width} height={height} fill="url(#map-dots)" rx="12" />

			{edges.map((e, i) => {
				const a = pos.get(e.from)!;
				const b = pos.get(e.to)!;
				const stat = edgeStats?.get(`${e.from} -> ${e.to}`);
				const flagged = stat?.flagged === true;
				const color = flagged ? "#dc2626" : "#94a3b8";
				const strokeWidth = 1.2 + (e.count / maxEdge) * 4;
				const label = stat ? `${e.count} · ${formatDuration(stat.median_ms)}` : `${e.count}`;

				if (e.from === e.to) {
					// Self-loop arc above the node
					const cx = a.x + NODE_W / 2;
					const cy = a.y;
					return (
						<g key={i} style={{ color }}>
							<path
								d={`M ${cx - 26} ${cy} C ${cx - 26} ${cy - 52}, ${cx + 26} ${cy - 52}, ${cx + 26} ${cy}`}
								fill="none"
								stroke={color}
								strokeWidth={strokeWidth}
								markerEnd="url(#map-arrow)"
							/>
							<EdgeLabel x={cx} y={cy - 56} text={label} flagged={flagged} />
						</g>
					);
				}

				const x1 = a.x + NODE_W;
				const y1 = a.y + NODE_H / 2;
				const x2 = b.x;
				const y2 = b.y + NODE_H / 2;
				const midX = (x1 + x2) / 2;
				const midY = (y1 + y2) / 2;

				// Skip edges (spanning more than one rank) arc above intermediate nodes.
				if (x2 - x1 > X_GAP) {
					const arcTop = Math.min(a.y, b.y) - 60;
					const apexY = (midY + arcTop) / 2;
					return (
						<g key={i} style={{ color }}>
							<path
								d={`M ${x1} ${y1} Q ${midX} ${arcTop}, ${x2} ${y2}`}
								fill="none"
								stroke={color}
								strokeWidth={strokeWidth}
								markerEnd="url(#map-arrow)"
							/>
							<EdgeLabel x={midX} y={apexY - 8} text={label} flagged={flagged} />
						</g>
					);
				}

				// Push the pill off the line: up for straight runs, perpendicular for diagonals.
				const diagonal = Math.abs(y2 - y1) > 4;
				const lx = midX + (diagonal ? 26 : 0);
				const ly = midY - (diagonal ? 14 : 26);
				return (
					<g key={i} style={{ color }}>
						<path
							d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
							fill="none"
							stroke={color}
							strokeWidth={strokeWidth}
							markerEnd="url(#map-arrow)"
						/>
						<EdgeLabel x={lx} y={ly} text={label} flagged={flagged} />
					</g>
				);
			})}

			{nodes.map((n) => {
				const p = pos.get(n.activity)!;
				const accent = accentFor(n.activity);
				const label = n.activity.length > 20 ? `${n.activity.slice(0, 19)}…` : n.activity;
				return (
					<g key={n.activity} transform={`translate(${p.x}, ${p.y})`}>
						<rect width={NODE_W} height={NODE_H} rx="10" fill="white" stroke="#e2e8f0" />
						<rect x={7} y={9} width={4} height={NODE_H - 18} rx="2" fill={accent} />
						<text x={20} y={22} fontSize="12" fontWeight="600" fill="#0f172a">
							{label}
						</text>
						<text x={20} y={39} fontSize="10" fill="#94a3b8">
							{n.count} events
						</text>
						<title>{n.activity}</title>
					</g>
				);
			})}
		</svg>
	);
}
