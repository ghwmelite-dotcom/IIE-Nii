export interface Overview {
	employees: number;
	events_total: number;
	events_today: number;
	sources: { source: string; total: number; today: number }[];
	leave_open: number;
	flagged_bottlenecks: number;
	last_mining_run: string | null;
}

export interface AttendanceDay {
	date: string;
	clock_ins: number;
	late: number;
	missing_out: number;
}

export interface EventItem {
	event_id: string;
	case_id: string;
	activity: string;
	resource: string;
	timestamp: string;
	source_system: string;
	metadata: Record<string, unknown>;
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
	model_id: string;
	source: string;
	case_count: number;
	event_count: number;
	created_at: string;
	graph: { nodes: DFGNode[]; edges: DFGEdge[] };
	variants: Variant[];
}

export interface Bottleneck {
	id: string;
	activity_pair: string;
	source: string;
	count: number;
	mean_ms: number;
	median_ms: number;
	p95_ms: number;
	max_ms: number;
	flagged: boolean;
	period: string;
}

export interface Conformance {
	detected_at: string | null;
	summary: { deviations: number; avg_score: number | null; by_type: Record<string, number> };
	deviations: { id: string; case_id: string; deviation_type: string; description: string; score: number }[];
}

export interface Recommendation {
	kind: "bottleneck" | "conformance" | "variability";
	severity: "high" | "medium" | "low";
	title: string;
	detail: string;
}

export interface ChatResponse {
	reply: string;
	intent: string;
	sources?: string[];
}

async function get<T>(path: string): Promise<T> {
	const res = await fetch(path);
	if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
	return res.json() as Promise<T>;
}

export const api = {
	overview: () => get<Overview>("/api/stats/overview"),
	attendanceDaily: (days = 30) => get<{ days: AttendanceDay[] }>(`/api/stats/attendance-daily?days=${days}`),
	leavePipeline: () => get<{ stages: Record<string, number> }>("/api/stats/leave-pipeline"),
	recentEvents: (limit = 25) => get<{ events: EventItem[] }>(`/api/events/recent?limit=${limit}`),
	processMap: (source?: string) => get<{ models: ProcessModel[] }>(`/api/intelligence/process-map${source ? `?source=${source}` : ""}`),
	bottlenecks: (source?: string) =>
		get<{ period: string | null; bottlenecks: Bottleneck[] }>(`/api/intelligence/bottlenecks${source ? `?source=${source}` : ""}`),
	conformance: () => get<Conformance>("/api/intelligence/conformance"),
	recommendations: () => get<{ generated_at: string; recommendations: Recommendation[] }>("/api/intelligence/recommendations"),
	chat: async (employee_id: string, message: string): Promise<ChatResponse> => {
		const res = await fetch("/api/chatbot/message", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ employee_id, message }),
		});
		if (!res.ok) throw new Error(`POST /api/chatbot/message → ${res.status}`);
		return res.json() as Promise<ChatResponse>;
	},
};
