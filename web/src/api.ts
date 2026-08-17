export interface Overview {
	employees: number;
	events_total: number;
	events_today: number;
	sources: { source: string; total: number; today: number }[];
	leave_open: number;
	flagged_bottlenecks: number;
	last_mining_run: string | null;
}

export interface AttendanceRecord {
	record_id: string;
	employee_id: string;
	date: string;
	clock_in: string | null;
	clock_out: string | null;
	status: string;
}

export interface AttendanceSummary {
	employee_id: string;
	name: string;
	department_id: string;
	total_days: number;
	late_days: number;
	missing_clockouts: number;
	recent: AttendanceRecord[];
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

export interface DepartmentInsight {
	department: string;
	clock_ins: number;
	late_rate: number;
	leave_cases: number;
	avg_leave_days: number | null;
}

export interface ReportData {
	meta: { period: string; start: string; end: string; generated_at: string };
	summary: { employees: number; events: number; leave_submitted: number; leave_completed: number; avg_leave_cycle_days: number | null; late_rate: number };
	attendance: { clock_ins: number; late: number; late_rate: number; by_department: { department: string; clock_ins: number; late: number; late_rate: number }[] };
	leave: { submitted: number; completed: number; rejected: number; cancelled: number; avg_cycle_days: number | null; by_type: { type: string; count: number }[] };
	process: { flagged_bottlenecks: number; top_bottleneck: string | null; conformance_rate: number | null; variant_count: number };
	recommendations: Recommendation[];
}

export interface ChatResponse {
	reply: string;
	intent: string;
	sources?: string[];
}

export interface Employee {
	employee_id: string;
	name: string;
	department_id: string;
	role: string;
}

export interface CaseTrace {
	case_id: string;
	count: number;
	events: EventItem[];
}

export interface LeaveRequest {
	request_id: string;
	employee_id: string;
	type: string;
	start_date: string;
	end_date: string;
	status: string;
	current_step: string;
	created_at: string;
}

export interface LeaveTransition {
	from_step: string;
	to_step: string;
	actor_id: string;
	timestamp: string;
}

export type LeaveStatus = LeaveRequest & { history: LeaveTransition[] };

export interface Me {
	email: string;
	user_id: string;
	employee_id: string | null;
	employee: { employee_id: string; name: string; department_id: string; role: string } | null;
	roles: string[];
	capabilities: string[];
	scopes: { role_id: string; scope_type: string; scope_id: string }[];
}

export interface AdminUser {
	user_id: string;
	email: string;
	status: string;
	last_login_at: string | null;
	name: string | null;
	department_id: string | null;
	roles: string | null;
}

export interface AuditEntry {
	id: string;
	actor_email: string | null;
	action: string;
	target_id: string | null;
	created_at: string;
}

export class AuthError extends Error {
	constructor() {
		super("Not signed in");
	}
}

const JSON_MUT = { "Content-Type": "application/json", "X-Requested-With": "fetch" };

async function get<T>(path: string): Promise<T> {
	const res = await fetch(path, { credentials: "include" });
	if (res.status === 401) throw new AuthError();
	if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
	return res.json() as Promise<T>;
}

async function mut<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(path, { method: "POST", credentials: "include", headers: JSON_MUT, body: JSON.stringify(body) });
	const data = (await res.json().catch(() => ({}))) as { error?: string };
	if (res.status === 401) throw new AuthError();
	if (!res.ok) throw new Error(data.error ?? `POST ${path} → ${res.status}`);
	return data as T;
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
	departmentInsights: () => get<{ departments: DepartmentInsight[] }>("/api/stats/department-insights"),
	employees: () => get<{ employees: Employee[] }>("/api/org/employees"),
	caseTrace: (caseId: string) => get<CaseTrace>(`/api/events?case_id=${encodeURIComponent(caseId)}`),
	myLeave: (employeeId: string) => get<{ requests: LeaveRequest[] }>(`/api/leave?employee_id=${encodeURIComponent(employeeId)}`),
	leaveInbox: (step?: string) => get<{ requests: LeaveRequest[] }>(`/api/leave${step ? `?current_step=${step}` : ""}`),
	leaveStatus: (id: string) => get<LeaveStatus>(`/api/leave/${encodeURIComponent(id)}/status`),
	me: () => get<Me>("/auth/me"),
	requestCode: (email: string) => mut<unknown>("/auth/request-code", { email }),
	verifyCode: (email: string, code: string) => mut<unknown>("/auth/verify", { email, code }),
	logout: () => mut<unknown>("/auth/logout", {}),
	requestLeave: (type: string, start_date: string, end_date: string, on_behalf_of?: string) =>
		mut<{ request_id: string }>("/api/leave/request", { type, start_date, end_date, ...(on_behalf_of ? { on_behalf_of } : {}) }),
	transitionLeave: (id: string, action: "approve" | "reject" | "cancel", reason?: string) =>
		mut<{ status: string }>(`/api/leave/${encodeURIComponent(id)}/transition`, { action, ...(reason ? { reason } : {}) }),
	chat: (message: string) => mut<ChatResponse>("/api/chatbot/message", { message }),
	adminUsers: () => get<{ users: AdminUser[] }>("/api/admin/users"),
	adminUser: (id: string) =>
		get<{ user_id: string; email: string; status: string; roles: { role_id: string; scope_type: string; scope_id: string }[] }>(`/api/admin/users/${id}`),
	adminGrant: (id: string, role_id: string, scope_id?: string) =>
		mut<unknown>(`/api/admin/users/${id}/roles`, { role_id, ...(scope_id ? { scope_type: "department", scope_id } : {}) }),
	adminRevoke: (id: string, role_id: string, scope_id?: string) =>
		mut<unknown>(`/api/admin/users/${id}/roles/revoke`, { role_id, ...(scope_id ? { scope_id } : {}) }),
	adminSetStatus: (id: string, status: "active" | "disabled") => mut<unknown>(`/api/admin/users/${id}/status`, { status }),
	adminProvision: () => mut<{ created: number; missingEmail: string[] }>("/api/admin/provision", {}),
	adminAudit: () => get<{ entries: AuditEntry[] }>("/api/admin/audit"),
	attendanceSummary: (employeeId: string) => get<AttendanceSummary>(`/api/attendance/${encodeURIComponent(employeeId)}/summary`),
	report: (period: string) => get<ReportData>(`/api/reports/${period}`),
	reportCsvUrl: (period: string) => `/api/reports/${period}/csv`,
	reportHtmlUrl: (period: string) => `/api/reports/${period}/html`,
};
