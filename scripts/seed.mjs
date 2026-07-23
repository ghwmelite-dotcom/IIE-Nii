#!/usr/bin/env node
/**
 * Synthetic event generator for the IIE event backbone.
 * Replays months of realistic OHCS operational events into POST /api/events/batch.
 *
 * Usage: node scripts/seed.mjs [--base URL] [--employees N] [--months N] [--seed N] [--batch N] [--key K] [--reset]
 * Example: node scripts/seed.mjs --employees 10 --months 1   (quick smoke test)
 *          node scripts/seed.mjs --reset                    (wipe all tables, then seed fresh)
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

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
// 122 officers + 27 unit management (Director/Deputy/AD1 × 9) + 1 HR officer
// = 150 total OHCS staff strength.
const EMPLOYEES = Number(args.employees ?? 122);
const MONTHS = Number(args.months ?? 6);
const SEED = Number(args.seed ?? 42);
const BATCH = Number(args.batch ?? 500);

// API key for the protected ingestion endpoints: --key flag, IIE_API_KEY env,
// or the local .dev.vars file.
function loadApiKey() {
	if (args.key) return args.key;
	if (process.env.IIE_API_KEY) return process.env.IIE_API_KEY;
	try {
		const vars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
		return Object.fromEntries(
			vars
				.split("\n")
				.filter((line) => line.includes("="))
				.map((line) => line.split("=", 2)),
		).API_KEY;
	} catch {
		return undefined;
	}
}
const API_KEY = loadApiKey();
const headers = { "Content-Type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) };

// --reset: wipe every table (children before parents, FK-safe) so the run
// starts from an empty log instead of appending duplicates.
if (args.reset) {
	const mode = /localhost|127\.0\.0\.1/.test(BASE) ? "--local" : "--remote";
	const wipe =
		"DELETE FROM events; DELETE FROM attendance_records; DELETE FROM leave_requests; " +
		"DELETE FROM workflow_transitions; DELETE FROM process_models; DELETE FROM bottlenecks; " +
		"DELETE FROM conformance_results; DELETE FROM employees; DELETE FROM departments;";
	console.log(`Resetting database (${mode.slice(2)})…`);
	execSync(`npx wrangler d1 execute iie-event-log ${mode} --command "${wipe}"`, { stdio: "pipe" });
}

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

// OHCS organizational structure: 5 directorates + 4 units (ids are the real acronyms).
const DEPARTMENTS = [
	{ id: "RSIMD", name: "Research, Statistics & Information Management" },
	{ id: "PBMED", name: "Planning, Budgeting, Monitoring & Evaluation" },
	{ id: "CMD", name: "Career Management" },
	{ id: "F&A", name: "Finance & Administration" },
	{ id: "RTDD", name: "Recruitment, Training & Development" },
	{ id: "RCU", name: "Reform Coordinating Unit" },
	{ id: "CSC", name: "Civil Service Council" },
	{ id: "IAU", name: "Internal Audit Unit" },
	{ id: "PR", name: "Public Relations Unit" },
];
const LEAVE_TYPES = ["annual", "sick", "maternity", "study", "casual"];
const CHAT_TOPICS = ["leave_balance", "policy", "attendance", "payslip", "pension"];
const FIRST_NAMES = ["Ama", "Kofi", "Kwame", "Akosua", "Yaw", "Efua", "Kwabena", "Abena", "Kojo", "Adjoa"];
const LAST_NAMES = ["Mensah", "Owusu", "Boateng", "Asante", "Osei", "Agyemang", "Darko", "Nkrumah", "Appiah", "Frimpong"];

const deptId = (i) => DEPARTMENTS[i].id;
const directorId = (i) => `DIR-${DEPARTMENTS[i].id}`;
const deputyId = (i) => `DEP-${DEPARTMENTS[i].id}`;
const managerId = (i) => `AD1-${DEPARTMENTS[i].id}`;
const personName = (i) => `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;

// Org directory — imported via POST /api/org/import before events are sent.
// Grading structure: each directorate/unit is headed by a Director (management)
// with at least one Deputy Director; middle management runs from Assistant
// Director I up to Deputy Director (workflow role "line_manager"); the rest are
// officers of varying lower grades (workflow role "staff").
// Leave administration designations (deputy-director rank): F&A's Deputy
// Director doubles as the admin officer verifying standard leave; RTDD's
// Deputy Director is the Schedule Officer reviewing study leave.
const departments = DEPARTMENTS.map((d, i) => ({ department_id: d.id, name: d.name, head_employee_id: directorId(i) }));
const deputyRole = (id) => (id === "F&A" ? "admin_officer" : id === "RTDD" ? "schedule_officer" : "line_manager");
const orgEmployees = [
	...DEPARTMENTS.flatMap((d, i) => [
		{
			employee_id: directorId(i),
			name: personName(i + 200),
			department_id: d.id,
			role: "director",
			email: `${directorId(i).toLowerCase()}@ohcs.gov.gh`,
		},
		{
			employee_id: deputyId(i),
			name: personName(i + 300),
			department_id: d.id,
			role: deputyRole(d.id),
			email: `${deputyId(i).toLowerCase()}@ohcs.gov.gh`,
		},
		{
			employee_id: managerId(i),
			name: personName(i + 100),
			department_id: d.id,
			role: "line_manager",
			email: `${managerId(i).toLowerCase()}@ohcs.gov.gh`,
		},
	]),
	// HR function sits in the Career Management Directorate.
	{ employee_id: "HR-001", name: personName(150), department_id: "CMD", role: "hr_officer", email: "hr-001@ohcs.gov.gh" },
];

const employees = Array.from({ length: EMPLOYEES }, (_, i) => ({
	id: `EMP-${String(i + 1).padStart(4, "0")}`,
	dept: DEPARTMENTS[i % DEPARTMENTS.length].name,
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

Applications for annual leave must be submitted at least two (2) weeks before the intended start date, and must be approved by the officer's supervisor, verified by the Finance & Administration Directorate, and approved by the Director, F&A before the officer proceeds on leave.

Up to ten (10) unused working days may be carried over into the first quarter of the following leave year. Any balance above ten days lapses on 31 March of the following year.

Officers proceeding on annual leave must hand over their assignments and official documents to their supervisor or a designated officer before departure.`,
	},
	{
		title: "Attendance and Punctuality Policy",
		text: `OHCS Attendance and Punctuality Policy

Official working hours are 8:00 a.m. to 5:00 p.m., Monday to Friday. All staff are required to clock in on arrival and clock out on departure using the RFID access card system.

A grace period of thirty (30) minutes applies to the morning clock-in. Arrivals after 8:30 a.m. are recorded as late. Persistent lateness — more than four late arrivals in a month — is reported to the Career Management Directorate.

Staff who forget to clock out must report to the Career Management Directorate the next working day to regularize their record. Unexplained missing clock-outs are flagged as attendance anomalies.

Officers leaving the office during working hours for official assignments must complete a movement register at the front desk.`,
	},
	{
		title: "Sick Leave and Medical Policy",
		text: `OHCS Sick Leave and Medical Policy

An officer who is unable to report for duty due to illness must notify their supervisor as early as possible, and in any case before 10:00 a.m. on the first day of absence.

Sick leave of up to three (3) consecutive days may be taken without a medical certificate. Absence beyond three days must be supported by a medical certificate issued by a registered medical practitioner or a government hospital.

Sick leave is not deducted from the annual leave entitlement. Extended medical absence is handled under the Civil Service medical boarding procedures.

The Career Management Directorate may refer an officer for an independent medical review where sick leave patterns raise concern.`,
	},
	{
		title: "Study Leave Policy",
		text: `OHCS Study Leave Policy (Civil Service Training Regulations)

Study leave may be granted to confirmed officers pursuing approved courses of study relevant to the Service. Study leave across OHCS and the entire Ghana Civil Service is administered centrally by the Recruitment, Training & Development Directorate (RTDD).

Applications must first be endorsed by the officer's own supervisor, after which they are reviewed by the Schedule Officer in RTDD, who verifies the course relevance, bonding requirements, and staffing implications.

Final approval of every study leave application rests with the Director, RTDD. No officer may proceed on study leave without the Director RTDD's written approval.

Officers granted study leave with pay are bonded to serve the Civil Service for a period equal to the duration of the programme of study.`,
	},
];

const periodStart = new Date();
periodStart.setMonth(periodStart.getMonth() - MONTHS);
periodStart.setHours(0, 0, 0, 0);
const periodEnd = new Date();

// Case ids are namespaced by seed so runs with different --seed values can
// never merge traces in the event log. Re-running with the SAME seed is still
// additive (duplicates) — reset the DB first if you want a clean log.
const NS = `s${SEED}`;

const events = [];
const emit = (e) => events.push(e);

// --- Attendance: clock_in / clock_out per workday, with anomalies ---
for (const emp of employees) {
	for (const d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
		if (d.getDay() === 0 || d.getDay() === 6) continue;
		const dateStr = d.toISOString().slice(0, 10);
		const caseId = `att-${NS}-${emp.id}-${dateStr}`;

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
	const reqId = `LR-${NS}-${String(++leaveSeq).padStart(5, "0")}`;
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
	// 10% bypass supervisor review — conformance violations for the checker to find.
	if (rand() >= 0.1) {
		t += (12 + rand() * 60) * 3600_000; // 12–72h
		step("supervisor_review", managerId(emp.deptIdx), { decision: "approved" });
	}
	// Routing forks on type: study leave is administered by RTDD, all other
	// types by F&A — each verified by the directorate's officer and approved by
	// its Director.
	const study = type === "study";
	const verifyActivity = study ? "rtdd_review" : "fa_verification";
	const approveActivity = study ? "director_rtdd_approval" : "director_fa_approval";
	const verifier = study ? "DEP-RTDD" : "DEP-F&A";
	const approver = study ? "DIR-RTDD" : "DIR-F&A";
	t += study ? (12 + rand() * 36) * 3600_000 : (24 + rand() * 120) * 3600_000; // F&A verification is the planted slow step (1–6d)
	step(verifyActivity, verifier);
	if (rand() < 0.15) {
		step("rejected", verifier, { reason: "insufficient balance" });
		continue;
	}
	t += (24 + rand() * 72) * 3600_000; // 1–4d
	step(approveActivity, approver);
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
			case_id: `chat-${NS}-${emp.id}-${d.toISOString().slice(0, 10)}`,
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
		headers,
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
		headers,
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
		headers,
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
