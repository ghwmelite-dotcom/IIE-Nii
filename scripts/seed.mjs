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

const employees = Array.from({ length: EMPLOYEES }, (_, i) => ({
	id: `EMP-${String(i + 1).padStart(4, "0")}`,
	dept: DEPARTMENTS[i % DEPARTMENTS.length],
}));

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
		step("manager_review", `mgr-${emp.dept}`, { decision: "approved" });
	}
	t += (24 + rand() * 120) * 3600_000; // 1–6d — deliberately the slow step
	step("hr_verification", "hr-officer-1");
	if (rand() < 0.15) {
		step("rejected", "hr-officer-1", { reason: "insufficient balance" });
		continue;
	}
	t += (24 + rand() * 72) * 3600_000; // 1–4d
	step("director_approval", "director-1");
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
