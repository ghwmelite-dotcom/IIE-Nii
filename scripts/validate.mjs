#!/usr/bin/env node
/**
 * PRD §13 validation harness. Measures the success metrics against a running
 * dev server and the seeded ground truth (the seed plants a known bottleneck
 * and ~10% manager-bypass violations, so detection accuracy is measurable).
 *
 * Usage: node scripts/validate.mjs [--base URL] [--no-ai]
 * Requires: dev server running, full seed loaded (npm run seed).
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
const WITH_AI = args.ai !== false && args["no-ai"] === undefined;

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

const results = [];
function report(name, target, measured, pass, detail = "") {
	results.push({ name, target, measured, pass });
	console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n     target: ${target} | measured: ${measured}${detail ? `\n     ${detail}` : ""}`);
}

async function getJson(path, options = {}) {
	const res = await fetch(`${BASE}${path}`, options);
	if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
	return res.json();
}

// Fail fast if the server isn't up.
try {
	await getJson("/health");
} catch {
	console.error(`Cannot reach ${BASE}/health — start the dev server first (npm run dev).`);
	process.exit(1);
}

console.log(`IIE validation against ${BASE} (${new Date().toISOString()})\n`);

// Refresh the analysis so every metric below reflects the current log.
await getJson("/api/intelligence/run", { method: "POST", headers, body: "{}" });

// ── 1. Event ingestion latency < 500ms ─────────────────────────────
{
	const samples = [];
	for (let i = 0; i < 20; i++) {
		const start = performance.now();
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				case_id: `VAL-LAT-${i}`,
				activity: "clock_in",
				resource: "EMP-0001",
				source_system: "ATTENDANCE",
			}),
		});
		samples.push(performance.now() - start);
		if (!res.ok) throw new Error(`latency sample failed: ${res.status}`);
	}
	samples.sort((a, b) => a - b);
	const p50 = samples[Math.floor(samples.length / 2)];
	const max = samples[samples.length - 1];
	report("Event capture latency", "< 500ms", `p50 ${p50.toFixed(0)}ms, max ${max.toFixed(0)}ms (local dev)`, max < 500);
}

// ── 2. Process mining discovers ≥ 3 workflow variants ──────────────
{
	const { models } = await getJson("/api/intelligence/process-map?source=LEAVE_WORKFLOW");
	const variants = models[0]?.variants.length ?? 0;
	report("Workflow variants discovered", "≥ 3", `${variants}`, variants >= 3);
}

// ── 3. Bottleneck detection finds the planted slow step (>90% acc.) ─
{
	// Ground truth (by seed design): hr_verification is the slowest step.
	const { bottlenecks } = await getJson("/api/intelligence/bottlenecks?source=LEAVE_WORKFLOW");
	const top = bottlenecks[0];
	const found = top && top.activity_pair.includes("hr_verification");
	report(
		"Bottleneck detection (slowest step)",
		"hr_verification transition flagged",
		top ? `${top.activity_pair} (median ${(top.median_ms / 86_400_000).toFixed(1)}d, p95 ${(top.p95_ms / 86_400_000).toFixed(1)}d)` : "none",
		found,
	);
}

// ── 4. Conformance flags > 80% of known violations ─────────────────
{
	// Independent ground truth ("manual audit") straight from the log:
	// terminal cases that reached hr_verification without manager_review.
	const sql = `WITH terminal AS (
    SELECT DISTINCT case_id FROM events
    WHERE source_system = 'LEAVE_WORKFLOW' AND activity IN ('completed','rejected')),
  acts AS (
    SELECT case_id,
      MAX(CASE WHEN activity = 'manager_review' THEN 1 ELSE 0 END) AS has_mgr,
      MAX(CASE WHEN activity = 'hr_verification' THEN 1 ELSE 0 END) AS has_hr
    FROM events WHERE source_system = 'LEAVE_WORKFLOW' GROUP BY case_id)
  SELECT a.case_id FROM acts a JOIN terminal t ON t.case_id = a.case_id
  WHERE a.has_mgr = 0 AND a.has_hr = 1`;
	const raw = execSync(
		`npx wrangler d1 execute iie-event-log --local --json --command "${sql.replace(/\s+/g, " ")}"`,
		{ encoding: "utf8" },
	);
	const groundTruth = new Set(JSON.parse(raw)[0].results.map((row) => row.case_id));

	const { deviations } = await getJson("/api/intelligence/conformance");
	const flagged = new Set(deviations.map((d) => d.case_id));
	const hits = [...groundTruth].filter((id) => flagged.has(id)).length;
	const rate = groundTruth.size > 0 ? hits / groundTruth.size : 1;
	const falsePositives = [...flagged].filter((id) => !groundTruth.has(id)).length;
	report(
		"Conformance detection rate",
		"> 80% of known violations",
		`${hits}/${groundTruth.size} = ${(rate * 100).toFixed(0)}% (${falsePositives} false positives)`,
		rate > 0.8,
	);
}

// ── 5. Dashboard loads in < 2s ──────────────────────────────────────
{
	const start = performance.now();
	const res = await fetch(`${BASE}/`);
	const elapsed = performance.now() - start;
	await res.text();
	report("Dashboard load time", "< 2s", `${elapsed.toFixed(0)}ms (local dev)`, res.ok && elapsed < 2000);
}

// ── 6. Chatbot resolves > 60% of policy queries ────────────────────
if (WITH_AI) {
	const questions = [
		"How many days of annual leave am I entitled to?",
		"What is the grace period for morning clock-in?",
		"How many leave days can I carry over?",
		"When must I submit an annual leave application?",
		"Do I need a medical certificate for two days of sick leave?",
	];
	const DEFLECTION = /couldn't find|ask HR directly|do not cover|I'm the OHCS assistant/i;
	let resolved = 0;
	for (const message of questions) {
		const res = await getJson("/api/chatbot/message", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ employee_id: "EMP-0001", message }),
		});
		if (res.reply && !DEFLECTION.test(res.reply)) resolved++;
	}
	const rate = resolved / questions.length;
	report("Chatbot policy resolution", "> 60%", `${resolved}/${questions.length} = ${(rate * 100).toFixed(0)}%`, rate > 0.6);
} else {
	console.log("SKIP  Chatbot policy resolution (--no-ai)");
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} metrics passed`);
if (failed.length > 0) process.exit(1);
