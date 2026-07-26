import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Employee, LeaveRequest, LeaveStatus } from "../api";
import EmployeePicker from "../components/EmployeePicker";

const LEAVE_TYPES = ["annual", "sick", "maternity", "study", "casual"];
const STEPS = ["supervisor_review", "fa_verification", "director_fa_approval", "rtdd_review", "director_rtdd_approval"] as const;
const STEP_ROLE: Record<(typeof STEPS)[number], string> = {
	supervisor_review: "line_manager",
	fa_verification: "admin_officer",
	director_fa_approval: "director",
	rtdd_review: "schedule_officer",
	director_rtdd_approval: "director",
};
// Verification/approval steps are scoped to their administering directorate.
const STEP_DEPT: Partial<Record<(typeof STEPS)[number], string>> = {
	fa_verification: "F&A",
	director_fa_approval: "F&A",
	rtdd_review: "RTDD",
	director_rtdd_approval: "RTDD",
};

const STATUS_BADGE: Record<string, string> = {
	pending: "bg-amber-100 text-amber-800",
	completed: "bg-emerald-100 text-emerald-800",
	rejected: "bg-red-100 text-red-800",
	cancelled: "bg-slate-200 text-slate-600",
	escalated: "bg-orange-100 text-orange-800",
};

const label = (s: string) => s.replaceAll("_", " ");

export default function MyLeave() {
	const [employeeId, setEmployeeId] = useState("EMP-0001");
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
	const [inbox, setInbox] = useState<LeaveRequest[]>([]);
	const [error, setError] = useState<string | null>(null);

	const [type, setType] = useState("annual");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const [expanded, setExpanded] = useState<string | null>(null);
	const [statuses, setStatuses] = useState<Record<string, LeaveStatus>>({});
	const [actors, setActors] = useState<Record<string, string>>({});
	const [rejecting, setRejecting] = useState<string | null>(null);
	const [reason, setReason] = useState("");

	const deptOf = (employee_id: string) => employees.find((e) => e.employee_id === employee_id)?.department_id;
	const nameOf = (employee_id: string) => employees.find((e) => e.employee_id === employee_id)?.name ?? employee_id;

	const refresh = useCallback(() => {
		api.myLeave(employeeId).then((r) => setMyRequests(r.requests)).catch((e) => setError(String(e)));
		api.leaveInbox().then((r) => setInbox(r.requests)).catch((e) => setError(String(e)));
	}, [employeeId]);

	useEffect(() => {
		api.employees().then((r) => setEmployees(r.employees)).catch(() => {});
	}, []);

	useEffect(() => {
		refresh();
		const id = setInterval(refresh, 15_000);
		return () => clearInterval(id);
	}, [refresh]);

	async function submit() {
		if (!startDate || !endDate) return;
		setBusy(true);
		setNotice(null);
		try {
			const { request_id } = await api.requestLeave(employeeId, type, startDate, endDate);
			setNotice(`Submitted ${request_id} — now waiting at supervisor review.`);
			setStartDate("");
			setEndDate("");
			refresh();
		} catch (e) {
			setNotice(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	async function toggleExpand(id: string) {
		setExpanded(expanded === id ? null : id);
		if (!statuses[id]) {
			const s = await api.leaveStatus(id).catch(() => null);
			if (s) setStatuses((prev) => ({ ...prev, [id]: s }));
		}
	}

	function eligibleActors(req: LeaveRequest): Employee[] {
		const step = req.current_step as (typeof STEPS)[number];
		const role = STEP_ROLE[step];
		if (!role) return [];
		const dept = step === "supervisor_review" ? deptOf(req.employee_id) : STEP_DEPT[step];
		return employees.filter((e) => e.role === role && (dept === undefined || e.department_id === dept));
	}

	async function act(req: LeaveRequest, action: "approve" | "reject") {
		const actor = actors[req.request_id] ?? eligibleActors(req)[0]?.employee_id;
		if (!actor) return;
		setBusy(true);
		try {
			await api.transitionLeave(req.request_id, action, actor, action === "reject" ? reason : undefined);
			setRejecting(null);
			setReason("");
			setStatuses((prev) => {
				const next = { ...prev };
				delete next[req.request_id];
				return next;
			});
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-6">
			{error && (
				<p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" onClick={() => setError(null)}>
					{error}
				</p>
			)}

			<div className="flex items-center gap-3">
				<span className="text-sm text-slate-500">Acting as</span>
				<EmployeePicker
					value={employeeId}
					onChange={setEmployeeId}
					className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
				/>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				<div className="space-y-6">
					{/* Submit */}
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">Submit a leave request</h2>
						<div className="flex flex-wrap items-end gap-3">
							<label className="text-xs text-slate-500">
								Type
								<select
									value={type}
									onChange={(e) => setType(e.target.value)}
									className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none"
								>
									{LEAVE_TYPES.map((t) => (
										<option key={t}>{t}</option>
									))}
								</select>
							</label>
							<label className="text-xs text-slate-500">
								From
								<input
									type="date"
									value={startDate}
									onChange={(e) => setStartDate(e.target.value)}
									className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none"
								/>
							</label>
							<label className="text-xs text-slate-500">
								To
								<input
									type="date"
									value={endDate}
									onChange={(e) => setEndDate(e.target.value)}
									className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none"
								/>
							</label>
							<button
								onClick={submit}
								disabled={busy || !startDate || !endDate}
								className="rounded-md bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
							>
								Submit
							</button>
						</div>
						{notice && <p className="mt-2 text-xs text-slate-600">{notice}</p>}
					</section>

					{/* My requests */}
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="mb-3 text-sm font-semibold text-slate-700">My requests</h2>
						{myRequests.length === 0 && <p className="text-sm text-slate-400">No requests yet for {employeeId}.</p>}
						<ul className="space-y-2">
							{myRequests.map((r) => (
								<li key={r.request_id} className="rounded-lg border border-slate-200 p-3">
									<div className="flex items-center gap-2">
										<button onClick={() => toggleExpand(r.request_id)} className="font-mono text-xs text-indigo-700 hover:underline">
											{r.request_id}
										</button>
										<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[r.status] ?? "bg-slate-100"}`}>
											{r.status}
										</span>
										<span className="ml-auto text-xs text-slate-500">
											{r.type} · {r.start_date} → {r.end_date}
										</span>
										{r.status === "pending" && (
											<button
												onClick={() => api.transitionLeave(r.request_id, "cancel", employeeId).then(refresh).catch((e) => setError(String(e)))}
												className="text-xs text-red-600 hover:underline"
											>
												Cancel
											</button>
										)}
									</div>
									{r.status === "pending" && <div className="mt-1 text-xs text-slate-400">waiting at {label(r.current_step)}</div>}
									{expanded === r.request_id && statuses[r.request_id] && (
										<ol className="mt-2 space-y-1 border-l border-slate-200 pl-3 text-xs text-slate-600">
											{statuses[r.request_id].history.map((h, i) => (
												<li key={i}>
													{label(h.from_step)} → <span className="font-medium">{label(h.to_step)}</span> · {h.actor_id} ·{" "}
													{h.timestamp.slice(0, 16).replace("T", " ")}
												</li>
											))}
										</ol>
									)}
								</li>
							))}
						</ul>
					</section>
				</div>

				{/* Approver inbox */}
				<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-1 text-sm font-semibold text-slate-700">Approver inbox</h2>
					<p className="mb-3 text-xs text-slate-400">
						Pending requests by stage. Pick the officer you act as — the list only offers roles allowed at that stage.
					</p>
					{STEPS.map((step) => {
						const reqs = inbox.filter((r) => r.current_step === step);
						return (
							<div key={step} className="mb-4">
								<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
									{label(step)} <span className="text-slate-400">({reqs.length})</span>
								</h3>
								{reqs.length === 0 && <p className="text-xs text-slate-400">Nothing waiting.</p>}
								<ul className="space-y-2">
									{reqs.map((r) => {
										const eligible = eligibleActors(r);
										const actor = actors[r.request_id] ?? eligible[0]?.employee_id ?? "";
										return (
											<li key={r.request_id} className="rounded-lg border border-slate-200 p-3 text-sm">
												<div className="flex items-center gap-2">
													<span className="font-medium">{nameOf(r.employee_id)}</span>
													<span className="text-xs text-slate-400">
														{r.employee_id} · {deptOf(r.employee_id)}
													</span>
													<span className="ml-auto text-xs text-slate-500">
														{r.type} · {r.start_date} → {r.end_date}
													</span>
												</div>
												<div className="mt-2 flex flex-wrap items-center gap-2">
													<select
														value={actor}
														onChange={(e) => setActors((prev) => ({ ...prev, [r.request_id]: e.target.value }))}
														className="max-w-56 truncate rounded-md border border-slate-300 px-2 py-1 text-xs outline-none"
														title="Acting officer"
													>
														{eligible.map((e) => (
															<option key={e.employee_id} value={e.employee_id}>
																{e.name} — {e.employee_id}
															</option>
														))}
													</select>
													<button
														onClick={() => act(r, "approve")}
														disabled={busy || !actor}
														className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
													>
														Approve
													</button>
													<button
														onClick={() => setRejecting(rejecting === r.request_id ? null : r.request_id)}
														className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white"
													>
														Reject
													</button>
												</div>
												{rejecting === r.request_id && (
													<div className="mt-2 flex gap-2">
														<input
															value={reason}
															onChange={(e) => setReason(e.target.value)}
															placeholder="Reason (required)"
															className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none"
														/>
														<button
															onClick={() => act(r, "reject")}
															disabled={busy || !reason.trim()}
															className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
														>
															Confirm
														</button>
													</div>
												)}
											</li>
										);
									})}
								</ul>
							</div>
						);
					})}
				</section>
			</div>
		</div>
	);
}
