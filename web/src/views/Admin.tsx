import { useEffect, useState } from "react";
import { api, type AdminUser, type AuditEntry } from "../api";

const AREA_ROLES = ["employee", "hr_admin", "process_analyst", "executive", "system_admin"];

export default function Admin() {
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [audit, setAudit] = useState<AuditEntry[]>([]);
	const [msg, setMsg] = useState<string | null>(null);
	const [sel, setSel] = useState("");
	const [role, setRole] = useState("employee");
	const [scope, setScope] = useState("");

	const load = () => {
		api
			.adminUsers()
			.then((r) => setUsers(r.users))
			.catch((e) => setMsg(String(e)));
		api
			.adminAudit()
			.then((r) => setAudit(r.entries))
			.catch(() => {});
	};

	useEffect(load, []);

	async function provision() {
		const r = await api.adminProvision();
		setMsg(`Provisioned ${r.created} user(s); ${r.missingEmail.length} without email.`);
		load();
	}

	async function grant() {
		if (!sel) return;
		await api.adminGrant(sel, role, scope || undefined);
		load();
	}

	async function revoke(id: string, role_id: string) {
		await api.adminRevoke(id, role_id);
		load();
	}

	async function toggle(id: string, status: string) {
		await api.adminSetStatus(id, status === "active" ? "disabled" : "active");
		load();
	}

	return (
		<div className="space-y-6">
			{msg && <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{msg}</p>}
			<div className="flex items-center gap-3">
				<h2 className="text-sm font-semibold text-slate-700">Users &amp; roles</h2>
				<button onClick={provision} className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white">
					Provision from directory
				</button>
			</div>
			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-3 flex flex-wrap items-end gap-2 text-xs">
					<select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5">
						<option value="">Select user…</option>
						{users.map((u) => (
							<option key={u.user_id} value={u.user_id}>
								{u.email}
							</option>
						))}
					</select>
					<select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5">
						{AREA_ROLES.map((r) => (
							<option key={r}>{r}</option>
						))}
					</select>
					<input
						value={scope}
						onChange={(e) => setScope(e.target.value)}
						placeholder="dept scope (optional)"
						className="rounded-md border border-slate-300 px-2 py-1.5"
					/>
					<button onClick={grant} disabled={!sel} className="rounded-md bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-50">
						Grant
					</button>
				</div>
				<table className="w-full text-left text-xs">
					<thead className="text-slate-400">
						<tr>
							<th className="py-1">Email</th>
							<th>Name</th>
							<th>Roles</th>
							<th>Last login</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{users.map((u) => (
							<tr key={u.user_id} className="border-t border-slate-100">
								<td className="py-1.5 font-mono">{u.email}</td>
								<td>{u.name ?? "—"}</td>
								<td className="space-x-1">
									{(u.roles ? u.roles.split(",") : []).map((r) => (
										<button key={r} onClick={() => revoke(u.user_id, r)} title="revoke" className="rounded bg-slate-100 px-1.5 py-0.5 hover:bg-red-100">
											{r} ✕
										</button>
									))}
								</td>
								<td>{u.last_login_at ? u.last_login_at.slice(0, 16).replace("T", " ") : "never"}</td>
								<td>
									<button onClick={() => toggle(u.user_id, u.status)} className={u.status === "active" ? "text-emerald-700" : "text-red-700"}>
										{u.status}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="mb-3 text-sm font-semibold text-slate-700">Audit log</h2>
				<ul className="space-y-1 text-xs text-slate-600">
					{audit.map((a) => (
						<li key={a.id}>
							<span className="text-slate-400">{a.created_at.slice(0, 16).replace("T", " ")}</span> · {a.actor_email ?? "system"} ·{" "}
							<span className="font-medium">{a.action}</span> {a.target_id ?? ""}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
