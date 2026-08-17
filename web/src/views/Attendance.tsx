import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth, can } from "../auth/AuthContext";

interface AttendanceRecord {
	record_id: string;
	employee_id: string;
	date: string;
	clock_in: string | null;
	clock_out: string | null;
	status: string;
}

interface AttendanceSummary {
	employee_id: string;
	name: string;
	department_id: string;
	total_days: number;
	late_days: number;
	missing_clockouts: number;
	recent: AttendanceRecord[];
}

const STATUS_BADGE: Record<string, string> = {
	present: "bg-emerald-100 text-emerald-800",
	late: "bg-amber-100 text-amber-800",
	absent: "bg-red-100 text-red-800",
};

export default function Attendance() {
	const { me } = useAuth();
	const [employees, setEmployees] = useState<{ employee_id: string; name: string }[]>([]);
	const [selectedId, setSelectedId] = useState<string>("");
	const [summary, setSummary] = useState<AttendanceSummary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const canReadAny = me ? can(me, "attendance.read.any") : false;
	const myEmployeeId = me?.employee?.employee_id ?? "";

	useEffect(() => {
		if (canReadAny) {
			api.employees()
				.then((r) => setEmployees(r.employees.map((e) => ({ employee_id: e.employee_id, name: e.name }))))
				.catch(() => {});
		}
	}, [canReadAny]);

	useEffect(() => {
		const targetId = selectedId || myEmployeeId;
		if (!targetId) return;
		setLoading(true);
		setError(null);
		api.attendanceSummary(targetId)
			.then((data) => setSummary(data))
			.catch((e) => setError(e instanceof Error ? e.message : String(e)))
			.finally(() => setLoading(false));
	}, [selectedId, myEmployeeId]);

	return (
		<div className="space-y-6">
			{error && (
				<p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" onClick={() => setError(null)}>
					{error}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold text-slate-700">Attendance records</h2>
				{canReadAny && (
					<select
						value={selectedId}
						onChange={(e) => setSelectedId(e.target.value)}
						className="rounded-md border border-slate-300 px-2 py-1 text-xs"
					>
						<option value="">My records</option>
						{employees.map((e) => (
							<option key={e.employee_id} value={e.employee_id}>
								{e.name} ({e.employee_id})
							</option>
						))}
					</select>
				)}
				{summary && (
					<span className="ml-auto text-xs text-slate-400">
						{summary.name} · {summary.department_id}
					</span>
				)}
			</div>

			{loading && <p className="text-sm text-slate-400">Loading…</p>}

			{summary && !loading && (
				<>
					{/* Stat cards */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{[
							{ label: "Total days", value: summary.total_days },
							{ label: "Late days", value: summary.late_days },
							{ label: "Missing clock-outs", value: summary.missing_clockouts },
							{ label: "Punctuality rate", value: summary.total_days > 0 ? `${Math.round(((summary.total_days - summary.late_days) / summary.total_days) * 100)}%` : "—" },
						].map((s) => (
							<div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
								<div className="text-xs text-slate-500">{s.label}</div>
								<div className="mt-1 text-xl font-semibold">{s.value}</div>
							</div>
						))}
					</div>

					{/* Recent records table */}
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h3 className="mb-3 text-sm font-semibold text-slate-700">Recent records</h3>
						{summary.recent.length === 0 ? (
							<p className="text-sm text-slate-400">No attendance records found.</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full text-left text-xs">
									<thead className="text-slate-400">
										<tr>
											<th className="py-2">Date</th>
											<th className="py-2">Clock in</th>
											<th className="py-2">Clock out</th>
											<th className="py-2">Status</th>
										</tr>
									</thead>
									<tbody>
										{summary.recent.map((r) => (
											<tr key={r.record_id} className="border-t border-slate-100">
												<td className="py-2 font-mono">{r.date}</td>
												<td className="py-2">{r.clock_in ? r.clock_in.slice(11, 16) : "—"}</td>
												<td className="py-2">{r.clock_out ? r.clock_out.slice(11, 16) : "—"}</td>
												<td className="py-2">
													<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}>
														{r.status}
													</span>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>
				</>
			)}

			{!myEmployeeId && !canReadAny && (
				<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
					Your account isn&apos;t linked to an employee record — attendance self-service is unavailable.
				</div>
			)}
		</div>
	);
}
