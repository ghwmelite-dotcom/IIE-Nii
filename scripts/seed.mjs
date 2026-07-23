#!/usr/bin/env node
/**
 * Synthetic event generator for the IIE event backbone.
 * Replays months of realistic OHCS operational events into POST /api/events/batch.
 *
 * Usage: node scripts/seed.mjs [--base URL] [--employees N] [--months N] [--seed N] [--batch N]
 * Example: node scripts/seed.mjs --employees 10 --months 1   (quick smoke test)
 */

const args = Object.fromEntries(
	process.argv.slice(2).reduce((acc, cur, i, arr) => {
		if (cur.startsWith("--")) {
			const next = arr[i + 1];
			acc.push([cur.slice(2), next && !next.startsWith("--") ? next : true]);
		}
		return acc;
	}, []),
);

const BASE = args.base ?? "http://localhost:8787";
const EMPLOYEES = Number(args.employees ?? 50);
const MONTHS = Number(args.months ?? 6);
const SEED = Number(args.seed ?? 42);
const BATCH = Number(args.batch ?? 500);

// Deterministic PRNG (mulberry32) so datasets are reproducible.
function mulberry32(a) {
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const gauss = () => (rand() + rand() + rand()) / 1.5 - 1; // mean 0, roughly [-1, 1]
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const DEPARTMENTS = ["Administration", "Finance", "HR", "ICT", "Policy & Planning"];
const LEAVE_TYPES = ["annual", "sick", "maternity", "study", "casual"];
const CHAT_TOPICS = ["leave_balance", "policy", "attendance", "payslip", "pension"];
const FIRST_NAMES = ["Ama", "Kofi", "Kwame", "Akosua", "Yaw", "Efua", "Kwabena", "Abena", "Kojo", "Adjoa"];
const LAST_NAMES = ["Mensah", "Owusu", "Boateng", "Asante", "Osei", "Agyemang", "Darko", "Nkrumah", "Appiah", "Frimpong"];

const deptId = (i) => `DEPT-${String(i + 1).padStart(2, "0")}`;
const managerId = (i) => `MGR-${String(i + 1).padStart(2, "0")}`;
const personName = (i) => `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;

// Org directory — imported via POST /api/org/import before events are sent.
const departments = DEPARTMENTS.map((name, i) => ({ department_id: deptId(i), name, head_employee_id: managerId(i) }));
const orgEmployees = [
	...DEPARTMENTS.map((_, i) => ({
		employee_id: managerId(i),
		name: personName(i + 100),
		department_id: deptId(i),
		role: "line_manager",
		email: `${managerId(i).toLowerCase()}@ohcs.gov.gh`,
	})),
	{ employee_id: "HR-001", name: personName(150), department_id: deptId(2), role: "hr_officer", email: "hr-001@ohcs.gov.gh" },
	{ employee_id: "DIR-001", name: personName(200), department_id: deptId(0), role: "director", email: "dir-001@ohcs.gov.gh" },
];

const employees = Array.from({ length: EMPLOYEES }, (_, i) => ({
	id: `EMP-${String(i + 1).padStart(4, "0")}`,
	dept: DEPARTMENTS[i % DEPARTMENTS.length],
	deptIdx: i % DEPARTMENTS.length,
}));
orgEmployees.push(
	...employees.map((emp, i) => ({
		employee_id: emp.id,
		name: personName(i),
		department_id: deptId(emp.deptIdx),
		role: "staff",
		email: `${emp.id.toLowerCase()}@ohcs.gov.gh`,
		card_id: `CARD-${String(i + 1).padStart(4, "0")}`,
	})),
);

// --- HR policy corpus for the chatbot RAG (PRD §5.1) ---
const POLICIES = [
	{
		title: "Annual Leave Policy",
		text: `OHCS Annual Leave Policy (Civil Service Conditions of Service)

Every confirmed officer of the Civil Service is entitled to thirty (30) working days of annual leave per calendar year. Annual leave accrues from January to December and must be taken within the leave year.

Applications for annual leave must be submitted at least two (2) weeks before the intended start date, and must be approved by the officer's line manager, verified by the HR Directorate, and approved by a Director before the officer proceeds on leave.

Up to ten (10) unused working days may be carried over into the first quarter of the following leave year. Any balance above ten days lapses on 31 March of the following year.

Officers proceeding on annual leave must hand over their assignments and official documents to their line manager or a designated officer before departure.`,
	},
	{
		title: "Attendance and Punctuality Policy",
		text: `OHCS Attendance and Punctuality Policy

Official working hours are 8:00 a.m. to 5:00 p.m., Monday to Friday. All staff are required to clock in on arrival and clock out on departure using the RFID access card system.

A grace period of thirty (30) minutes applies to the morning clock-in. Arrivals after 8:30 a.m. are recorded as late. Persistent lateness — more than four late arrivals in a month — is reported to the HR Directorate.

Staff who forget to clock out must report to the HR Directorate the next working day to regularize their record. Unexplained missing clock-outs are flagged as attendance anomalies.

Officers leaving the office during working hours for official assignments must complete a movement register at the front desk.`,
	},
	{
		title: "Sick Leave and Medical Policy",
		text: `OHCS Sick Leave and Medical Policy

An officer who is unable to report for duty due to illness must notify their line manager as early as possible, and in any case before 10:00 a.m. on the first day of absence.

Sick leave of up to three (3) consecutive days may be taken without a medical certificate. Absence beyond three days must be supported by a medical certificate issued by a registered medical practitioner or a government hospital.

Sick leave is not deducted from the annual leave entitlement. Extended medical absence is handled under the Civil Service medical boarding procedures.

The HR Directorate may refer an officer for an independent medical review where sick leave patterns raise concern.`,
	},
];

const periodStart = new Date();
periodStart.setMonth(periodStart.getMonth() - MONTHS);
periodStart.setHours(0, 0, 0, 0);
const periodEnd = new Date();

const events = [];
const emit = (e) => events.push(e);

// --- Attendance: clock_in / clock_out per workday, with anomalies ---
for (const emp of employees) {
	for (const d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
		if (d.getDay() === 0 || d.getDay() === 6) continue;
		const dateStr = d.toISOString().slice(0, 10);
		const caseId = `att-${emp.id}-${dateStr}`;

		const late = rand() < 0.12;
		const inHour = clamp(late ? 9 + rand() : 8 + gauss() * 0.5, 7, 11);
		const clockIn = new Date(d);
		clockIn.setHours(Math.floor(inHour), Math.round((inHour % 1) * 60), 0, 0);
		emit({
			case_id: caseId,
			activity: "clock_in",
			resource: emp.id,
			timestamp: clockIn.toISOString(),
			source_system: "ATTENDANCE",
			metadata: { department: emp.dept, late },
		});

		if (rand() < 0.03) {
			emit({
				case_id: caseId,
				activity: "anomaly_detected",
				resource: "attendance-worker",
				timestamp: new Date(clockIn.getTime() + 12 * 3600_000).toISOString(),
				source_system: "ATTENDANCE",
				metadata: { type: "missing_clock_out", employee: emp.id, department: emp.dept },
			});
			continue;
		}

		const outHour = clamp(17 + gauss(), 15, 19);
		const clockOut = new Date(d);
		clockOut.setHours(Math.floor(outHour), Math.round((outHour % 1) * 60), 0, 0);
		emit({
			case_id: caseId,
			activity: "clock_out",
			resource: emp.id,
			timestamp: clockOut.toISOString(),
			source_system: "ATTENDANCE",
			metadata: { department: emp.dept },
		});
	}
}

// --- Leave workflow: full chains with realistic delays + injected deviations ---
let leaveSeq = 0;
const leaveCount = Math.round(EMPLOYEES * MONTHS * 0.35);
for (let i = 0; i < leaveCount; i++) {
	const emp = pick(employees);
	const reqId = `LR-${String(++leaveSeq).padStart(5, "0")}`;
	const type = pick(LEAVE_TYPES);
	let t = periodStart.getTime() + rand() * (periodEnd.getTime() - periodStart.getTime());
	const at = () => new Date(t).toISOString();
	const step = (activity, resource, extra = {}) =>
		emit({
			case_id: reqId,
			activity,
			resource,
			timestamp: at(),
			source_system: "LEAVE_WORKFLOW",
			metadata: { request_id: reqId, department: emp.dept, leave_type: type, ...extra },
		});

	step("leave_submitted", emp.id);
	// 10% bypass line-manager review — conformance violations for the checker to find.
	if (rand() >= 0.1) {
		t += (12 + rand() * 60) * 3600_000; // 12–72h
		step("manager_review", managerId(emp.deptIdx), { decision: "approved" });
	}
	t += (24 + rand() * 120) * 3600_000; // 1–6d — deliberately the slow step
	step("hr_verification", "HR-001");
	if (rand() < 0.15) {
		step("rejected", "HR-001", { reason: "insufficient balance" });
		continue;
	}
	t += (24 + rand() * 72) * 3600_000; // 1–4d
	step("director_approval", "DIR-001");
	step("completed", "system");
}

// --- Chatbot: scattered HR queries ---
for (const d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
	if (d.getDay() === 0 || d.getDay() === 6) continue;
	for (let q = 0; q < 3; q++) {
		const emp = pick(employees);
		const at = new Date(d);
		at.setHours(8 + Math.floor(rand() * 9), Math.floor(rand() * 60), 0, 0);
		emit({
			case_id: `chat-${emp.id}-${d.toISOString().slice(0, 10)}`,
			activity: "chat_query",
			resource: emp.id,
			timestamp: at.toISOString(),
			source_system: "CHATBOT",
			metadata: { topic: pick(CHAT_TOPICS), department: emp.dept },
		});
	}
}

events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// --- Import the org directory first (subsystems validate against it) ---
{
	const res = await fetch(`${BASE}/api/org/import`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ departments, employees: orgEmployees }),
	});
	if (!res.ok) {
		console.error(`Org import failed (${res.status}):`, await res.text());
		process.exit(1);
	}
	const { employees: imported } = await res.json();
	console.log(`Org imported: ${imported} employees, ${departments.length} departments`);
}

// --- Ingest the HR policy corpus for the chatbot RAG ---
for (const doc of POLICIES) {
	const res = await fetch(`${BASE}/api/chatbot/ingest`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(doc),
	});
	if (!res.ok) {
		console.error(`Policy ingest failed for "${doc.title}" (${res.status}):`, await res.text());
		process.exit(1);
	}
	const { doc_id, chunks } = await res.json();
	console.log(`Policy ingested: ${doc_id} (${chunks} chunks)`);
}

// --- POST in batches, fail fast on the first error ---
let sent = 0;
for (let i = 0; i < events.length; i += BATCH) {
	const chunk = events.slice(i, i + BATCH);
	const res = await fetch(`${BASE}/api/events/batch`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(chunk),
	});
	if (!res.ok) {
		console.error(`Batch failed (${res.status}):`, await res.text());
		process.exit(1);
	}
	const { ingested } = await res.json();
	sent += ingested;
	process.stdout.write(`\rIngested ${sent}/${events.length} events`);
}

console.log(
	`\nDone. ${sent} events | ${EMPLOYEES} employees | ${MONTHS} months | seed ${SEED} | ${(events.length / MONTHS / 30).toFixed(0)} events/day avg`,
);
