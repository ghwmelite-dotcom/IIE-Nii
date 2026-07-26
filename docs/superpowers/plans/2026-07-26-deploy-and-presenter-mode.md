# Deploy to Cloudflare + Presenter Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the IIE Worker + dashboard to the Ghwmelite Cloudflare account (public `*.workers.dev` URL, seeded), then add an in-app "Presenter Mode" that walks the presenter through the supervisor demo step by step, and redeploy.

**Architecture:** Part A provisions fresh account-scoped resources (D1, KV, Vectorize, R2) in the target account, deploys the existing Worker unchanged, and seeds it remotely. Part B adds two new frontend files (`presenter/script.ts` data, `components/PresenterMode.tsx` UI) plus a small wiring edit in `App.tsx`; the panel navigates the app via the existing hash routes.

**Tech Stack:** Cloudflare Wrangler 4 (D1/KV/Vectorize/R2/Workers), React + TypeScript + Tailwind (Vite), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-26-deploy-and-presenter-mode-design.md`

## Global Constraints

- Target account for ALL wrangler commands: `CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538` (Ghwmelite@gmail.com's Account). Prefix every wrangler invocation with this env var; never change the user's default account.
- Shell is Git Bash on Windows: env vars go inline before the command (`VAR=x npx wrangler ...`).
- No new npm dependencies anywhere. Frontend styling is Tailwind utility classes only.
- Tab ids (used by hash routing in `web/src/App.tsx:60-63`) are exactly: `operations`, `intelligence`, `decision`, `leave`. Hash values are `#operations` etc.
- Presenter step content must match `DEMO_GUIDE.md` §§1, 4–9 — do not invent new claims or numbers.
- No backend changes: `npm test` must stay green (32 tests) without modification.
- Do not read or print `.dev.vars`. The production API key is generated fresh in Task 1.
- Local dev must keep working after the `wrangler.jsonc` edits (local D1/KV are `--local`; the KV placeholder id is replaced by the real remote id, which local dev ignores).

---

### Task 1: Provision resources and deploy to the Ghwmelite account

**Files:**
- Modify: `wrangler.jsonc` (two id values only)

**Interfaces:**
- Consumes: existing `wrangler.jsonc`, `scripts/seed.mjs` (`--base`, `--key` flags), `scripts/validate.mjs` (`--base`, `--no-ai` flags).
- Produces: live site at `https://iie.<subdomain>.workers.dev`; updated `wrangler.jsonc` with remote `database_id` and KV `id`; a production API key (kept in the shell session for the seed step, stored only as a Cloudflare secret).

- [ ] **Step 1: Verify account access**

Run: `npx wrangler whoami`
Expected: account list includes `Ghwmelite@gmail.com's Account  ea2eb3a9813660dfca2a60e594858538`.

- [ ] **Step 2: Create the D1 database and capture its id**

```bash
CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler d1 create iie-event-log
```

Expected output contains a `database_id` UUID. In `wrangler.jsonc`, replace the existing `database_id` value (`14cf9a00-3266-4edd-a224-d8411fd0daec`) with the new one. Leave `database_name` and `binding` unchanged.

- [ ] **Step 3: Create the KV namespace and capture its id**

```bash
CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler kv namespace create CONFIG
```

Expected output contains an `id`. In `wrangler.jsonc`, replace `"id": "local-config-placeholder"` with `"id": "<new id>"`.

- [ ] **Step 4: Create the Vectorize index and R2 bucket**

```bash
CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler vectorize create iie-policy-index --dimensions=768 --metric=cosine
CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler r2 bucket create iie-policy-docs
```

Expected: both report created. No config change needed (names already in `wrangler.jsonc`).

- [ ] **Step 5: Generate and set the production API key**

```bash
API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "$API_KEY" | CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler secret put API_KEY
echo "$API_KEY"   # note it for the seed step; do not write it to any file
```

Expected: `✨ Success! Uploaded secret API_KEY`.

- [ ] **Step 6: Apply D1 migrations remotely**

```bash
CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler d1 migrations apply iie-event-log --remote
```

Expected: `0001_init.sql` and `0002_analysis.sql` listed as applied.

- [ ] **Step 7: Build the dashboard and deploy**

```bash
npm run build:web
CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler deploy
```

Expected: deploy succeeds and prints `https://iie.<subdomain>.workers.dev`.
If it fails saying the workers.dev subdomain is not enabled, run
`CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler workers subdomain set ghwmelite`
and retry the deploy. Record the final URL as `$SITE` for later steps.

- [ ] **Step 8: Seed the remote database (full dataset, ~3 minutes)**

```bash
node scripts/seed.mjs --reset --base "$SITE" --key "$API_KEY"
```

(`scripts/seed.mjs` accepts `--base` and `--key` per README §Deploy. `--reset` is harmless on a fresh DB and protects against accidental double-seeding.)
Expected: seed completes; final log lines report ~150 employees, ~33,300 events, policy docs ingested.

- [ ] **Step 9: Verify the live site**

```bash
curl -s "$SITE/health"
curl -s "$SITE/api/stats/overview"
node scripts/validate.mjs --base "$SITE" --no-ai
```

Expected: health returns ok; overview shows ~150 employees and ~33,300 events; validate passes the non-AI metrics (conformance 22/22, bottleneck = `supervisor_review → fa_verification`, variants ≥ 3, dashboard load < 2 s, latency < 500 ms). Open `$SITE` in a browser and click through all four tabs once.

- [ ] **Step 10: Regenerate types and commit**

```bash
npm run types
git add wrangler.jsonc worker-configuration.d.ts
git commit -m "chore: point bindings at Ghwmelite account resources (D1 id, KV id)"
```

---

### Task 2: Presenter script data file

**Files:**
- Create: `web/src/presenter/script.ts`

**Interfaces:**
- Produces: `export type PresenterStep = { id: string; act: string; tab: string; title: string; click: string; say: string; expect?: string; terminal?: string }` and `export const PRESENTER_SCRIPT: PresenterStep[]` (27 entries, ordered). `tab` is one of `operations | intelligence | decision | leave | ""` (empty = do not navigate). Task 3 imports both names.

- [ ] **Step 1: Write the script file**

Create `web/src/presenter/script.ts` with exactly this content:

```ts
// Presenter Mode walkthrough — content distilled from DEMO_GUIDE.md §§1, 4–9.
// Keep say-lines and expected numbers in sync with that document.
export type PresenterStep = {
	id: string;
	act: string;
	/** Hash-route tab to navigate to, or "" to stay put. */
	tab: string;
	title: string;
	/** What to click / do on screen. */
	click: string;
	/** The exact line to say. */
	say: string;
	/** The number to expect on screen. */
	expect?: string;
	/** Terminal command to run (display only — presenter runs it). */
	terminal?: string;
};

export const PRESENTER_SCRIPT: PresenterStep[] = [
	{
		id: "act0-pitch",
		act: "Opening",
		tab: "operations",
		title: "The 30-second pitch",
		click: "Nothing yet — deliver the pitch before touching the screen.",
		say: "IIE is a process intelligence platform for the Office of the Head of Civil Service. It collects a unified event log from three source systems — RFID attendance, the leave workflow, and an HR chatbot — and automatically mines that log to discover how processes actually run: it draws the real process map, finds bottlenecks, flags cases that skip required approval steps, and turns all of that into decision-support recommendations for management.",
	},
	{
		id: "act1-system-map",
		act: "Act 1 — Operations",
		tab: "operations",
		title: "System map",
		click: "Point at the system map at the top of the page.",
		say: "Every subsystem publishes events in one canonical format into a unified event log — that's the core design decision. New systems just start emitting events; nothing else changes.",
	},
	{
		id: "act1-stat-cards",
		act: "Act 1 — Operations",
		tab: "operations",
		title: "Stat cards",
		click: "Point at the headline stat cards.",
		say: "These poll the API every 10 seconds — if an event arrives, the numbers move on their own.",
		expect: "150 employees",
	},
	{
		id: "act1-live-feed",
		act: "Act 1 — Operations",
		tab: "operations",
		title: "Live event feed + case trace",
		click: "Click any row in the live event feed — the case's chronological trace opens in a modal.",
		say: "This feed is pushed live over server-sent events — the moment any subsystem posts, it appears here. And every row is clickable: every case carries its complete audit trail.",
	},
	{
		id: "act1-heatmap",
		act: "Act 1 — Operations",
		tab: "operations",
		title: "Attendance heatmap",
		click: "Hover a red-tinted cell in the 30-day attendance heatmap to show its tooltip.",
		say: "Green intensity is clock-in volume; a red tint means more than 25% of staff were late that day. You can spot bad Mondays at a glance.",
	},
	{
		id: "act1-pipeline",
		act: "Act 1 — Operations",
		tab: "operations",
		title: "Leave pipeline",
		click: "Point at the leave pipeline stage counts.",
		say: "This is the state machine working — every leave request moves through one of the two prescribed chains, and the pipeline shows where work is piling up.",
	},
	{
		id: "act2-process-map",
		act: "Act 2 — Process Intelligence",
		tab: "intelligence",
		title: "The discovered process map",
		click: "Point at the nodes and edges of the process map; briefly switch the source to ATTENDANCE and CHATBOT, then back to LEAVE_WORKFLOW.",
		say: "Nobody drew this process map — the system discovered it from the event log. It found BOTH prescribed chains on its own: standard leave through F&A, study leave through RTDD. Nobody told it about the F&A/RTDD split — it read it out of the data. Red edges are transitions over their SLA threshold.",
	},
	{
		id: "act2-bottlenecks",
		act: "Act 2 — Process Intelligence",
		tab: "intelligence",
		title: "Bottleneck panel",
		click: "Read the top row of the Bottlenecks panel.",
		say: "The single slowest hand-off in the leave process is getting from the supervisor's desk to F&A verification — a median of over three days. That's a staffing or routing problem at one specific step, and the system localised it exactly.",
		expect: "supervisor_review → fa_verification · median 3.3d · P95 5.7d",
	},
	{
		id: "act2-variants",
		act: "Act 2 — Process Intelligence",
		tab: "intelligence",
		title: "Workflow variants",
		click: "Point at the workflow variants list.",
		say: "256 leave cases collapse into a handful of distinct paths — the full F&A chain, the full RTDD study chain, the rejection variants… and these, where supervisor review never happened.",
	},
	{
		id: "act2-conformance",
		act: "Act 2 — Process Intelligence",
		tab: "intelligence",
		title: "Conformance panel",
		click: "Click a case id in the conformance panel — the full trace opens, showing the jump straight to verification.",
		say: "The conformance checker compares every case against the prescribed model for its leave type. In a real deployment this is the audit list — and every finding is inspectable down to the raw events.",
		expect: "22 skipped_step violations · ~91% conformant",
	},
	{
		id: "act3-banner",
		act: "Act 3 — Decision Support",
		tab: "decision",
		title: "Top insight banner",
		click: "Point at the dark insight banner at the top.",
		say: "Mining results are for analysts. This page is for management — it turns the analysis into plain-English recommendations, ranked by severity.",
	},
	{
		id: "act3-departments",
		act: "Act 3 — Decision Support",
		tab: "decision",
		title: "Department comparison",
		click: "Point at Civil Service Council (late rate) and Public Relations Unit (leave cycle).",
		say: "Every unit, compared on two fixed scales — red marks anything more than 1.5× the office average. This is the kind of cross-directorate comparison OHCS currently can't produce without manual spreadsheets — here it's a by-product of the event log.",
		expect: "CSC 13.8% late · PR Unit 7.6-day leave cycle",
	},
	{
		id: "act3-recommendations",
		act: "Act 3 — Decision Support",
		tab: "decision",
		title: "Recommendation cards",
		click: "Scroll the recommendation cards.",
		say: "Bottleneck alerts, the conformance finding — 22 cases bypassed supervisor review, enforce routing at submission — and the variability note.",
	},
	{
		id: "act3-export",
		act: "Act 3 — Decision Support",
		tab: "decision",
		title: "Export",
		click: "Point at the Download CSV and Print / Save as PDF buttons (top right).",
		say: "And this page leaves the building — the CSV drops the recommendations and department table straight into Excel, and Print produces a clean one-pager for a director's memo.",
	},
	{
		id: "act3-honesty",
		act: "Act 3 — Decision Support",
		tab: "decision",
		title: "Roadmap honesty",
		click: "Nothing — a verbal point.",
		say: "The recommendations are rule-generated today; an AI narrative layer over them is a planned next phase.",
	},
	{
		id: "act4-open",
		act: "Act 4 — AI Assistant",
		tab: "",
		title: "Open the assistant",
		click: "Click 'Ask OHCS assistant' (gradient pill, bottom-right). Show the 'Speaking as' dropdown and the suggestion chips.",
		say: "The assistant is retrieval-augmented: it embeds the actual OHCS policy documents into a vector database and answers strictly from retrieved excerpts — it can't invent policy. It also knows who it's talking to; per-user sign-in arrives with the SSO phase.",
	},
	{
		id: "act4-annual-leave",
		act: "Act 4 — AI Assistant",
		tab: "",
		title: "Policy question 1 — annual leave",
		click: "Ask: \"How many days of annual leave am I entitled to?\" — then point at the indigo source chips under the reply.",
		say: "The source chips are the proof it's RAG over the real policy documents, not memorised.",
		expect: "30 working days",
	},
	{
		id: "act4-grace",
		act: "Act 4 — AI Assistant",
		tab: "",
		title: "Policy question 2 — clock-in grace",
		click: "Ask: \"What is the grace period for morning clock-in?\"",
		say: "Straight from the attendance policy excerpt.",
		expect: "30 minutes — late after 8:30 a.m.",
	},
	{
		id: "act4-study-approver",
		act: "Act 4 — AI Assistant",
		tab: "",
		title: "Policy question 3 — study leave",
		click: "Ask: \"Who approves study leave applications?\"",
		say: "That's the Study Leave Policy we just saw in the process map — the chatbot and the miner agree because both read the same reality.",
		expect: "Director RTDD, after RTDD Schedule Officer review",
	},
	{
		id: "act4-personal",
		act: "Act 4 — AI Assistant",
		tab: "",
		title: "Personal data — no LLM",
		click: "Ask: \"How many days was I late this month?\"",
		say: "This is the hybrid design: personal data queries go straight to the database through deterministic rules — the language model only handles policy language.",
	},
	{
		id: "act4-transaction",
		act: "Act 4 — AI Assistant",
		tab: "",
		title: "Real transaction",
		click: "Say to the assistant: \"I'd like to request annual leave from 3 August 2026 to 7 August 2026.\" After it confirms, flip to the Operations tab — the new leave_submitted event is at the top of the live feed.",
		say: "The chatbot didn't just talk — it executed a real workflow transaction against the state machine, and you watched the event land in the log. Leave dates are only ever taken from the user's own message — the model can't invent dates for a transaction.",
		expect: "leave_submitted at top of live feed",
	},
	{
		id: "act5-submit",
		act: "Act 5 — My Leave",
		tab: "leave",
		title: "Submit a request",
		click: "With 'Acting as' set to any officer, pick annual leave, choose dates, Submit.",
		say: "The chatbot is one front door to the leave process. This is the other — a self-service portal. Same state machine underneath.",
		expect: "Request appears under My requests · pending at supervisor review",
	},
	{
		id: "act5-approve-chain",
		act: "Act 5 — My Leave",
		tab: "leave",
		title: "Approve the full chain",
		click: "In the Approver inbox: approve at supervisor review (unit Assistant Director I), then F&A verification (F&A admin officer), then Director F&A approval. Then flip to Operations — the chain streamed through the live feed.",
		say: "The picker only offers officers whose role and unit allow them to act — the state machine would reject anyone else.",
		expect: "Request lands in completed",
	},
	{
		id: "act5-study-routing",
		act: "Act 5 — My Leave",
		tab: "leave",
		title: "Study leave routes to RTDD",
		click: "Submit a study request, approve at supervisor review, and point at the inbox.",
		say: "Study leave doesn't go to F&A. It routes to RTDD — the Schedule Officer reviews, and only Director RTDD can approve. That's the real Civil Service rule, enforced by the same engine the miner audits against.",
	},
	{
		id: "act5-track",
		act: "Act 5 — My Leave",
		tab: "leave",
		title: "Track a request",
		click: "Expand a request under My requests — the step-by-step timeline with actor and timestamp.",
		say: "Every officer can see exactly where their request is and whose desk it's on.",
	},
	{
		id: "act6-validate",
		act: "Act 6 — Proof (optional)",
		tab: "",
		title: "Live validation",
		click: "Run the validation harness in a terminal.",
		say: "This measures the project's six PRD success metrics live, against the planted ground truth — the demo data deliberately plants these problems, and the harness measures detection against known answers.",
		expect: "6/6 metrics pass · conformance 22/22",
		terminal: "npm run validate",
	},
	{
		id: "act6-close",
		act: "Closing",
		tab: "",
		title: "One-minute recap",
		click: "Nothing — closing lines.",
		say: "One unified event log from every subsystem; automatic discovery of the real process — both leave chains, found by the miner itself; bottleneck and conformance analysis validated at 100% against known ground truth; management-ready recommendations, exportable to CSV and PDF; self-service leave that enforces the real approval rules; and an AI assistant that answers policy from the actual documents and executes real transactions. All on serverless infrastructure that deploys with a single command.",
	},
];
```

- [ ] **Step 2: Typecheck**

Run: `npm run check:web`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add web/src/presenter/script.ts
git commit -m "feat(web): presenter script distilled from demo guide"
```

---

### Task 3: PresenterMode component + App wiring

**Files:**
- Create: `web/src/components/PresenterMode.tsx`
- Modify: `web/src/App.tsx` (import, header button, mount — 3 small edits)

**Interfaces:**
- Consumes: `PRESENTER_SCRIPT` and `PresenterStep` from `../presenter/script` (Task 2). Hash routing already in `App.tsx` (`window.location.hash = id`; `hashchange` listener).
- Produces: default export `PresenterMode({ open, onClose }: { open: boolean; onClose: () => void })`. Persists step index in `localStorage` key `iie-presenter-step`.

- [ ] **Step 1: Create the component**

Create `web/src/components/PresenterMode.tsx`:

```tsx
import { useEffect, useState } from "react";
import { PRESENTER_SCRIPT } from "../presenter/script";

const STORAGE_KEY = "iie-presenter-step";

function initialIndex(): number {
	const saved = Number(window.localStorage.getItem(STORAGE_KEY));
	return Number.isInteger(saved) && saved >= 0 && saved < PRESENTER_SCRIPT.length ? saved : 0;
}

export default function PresenterMode({ open, onClose }: { open: boolean; onClose: () => void }) {
	const [index, setIndex] = useState(initialIndex);
	const [collapsed, setCollapsed] = useState(false);
	const step = PRESENTER_SCRIPT[index];
	const actSteps = PRESENTER_SCRIPT.filter((s) => s.act === step.act);
	const actStepNo = actSteps.indexOf(step) + 1;

	// Persist position and navigate the app to the step's tab.
	useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, String(index));
		const target = PRESENTER_SCRIPT[index].tab;
		if (open && target && window.location.hash !== `#${target}`) {
			window.location.hash = target;
		}
	}, [open, index]);

	if (!open) return null;

	const go = (delta: number) =>
		setIndex((i) => Math.min(PRESENTER_SCRIPT.length - 1, Math.max(0, i + delta)));

	return (
		<div className="fixed bottom-4 left-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-indigo-200 bg-white/95 shadow-2xl shadow-indigo-950/25 backdrop-blur">
			<div className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-white">
				<span className="text-[11px] font-semibold uppercase tracking-wider opacity-90">{step.act}</span>
				<span className="ml-auto text-[11px] font-medium opacity-90">
					{index + 1} / {PRESENTER_SCRIPT.length}
				</span>
				<button
					onClick={() => setCollapsed((c) => !c)}
					className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/15"
					title={collapsed ? "Expand" : "Collapse"}
				>
					{collapsed ? "▲" : "▼"}
				</button>
				<button onClick={onClose} className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/15" title="Close Presenter Mode">
					✕
				</button>
			</div>

			{collapsed ? (
				<div className="flex items-center gap-2 px-3 py-2">
					<span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{step.title}</span>
					<NavButtons index={index} go={go} />
				</div>
			) : (
				<div className="space-y-2.5 px-3 py-3">
					<h3 className="text-sm font-semibold text-slate-900">
						{step.title}
						<span className="ml-2 text-[11px] font-normal text-slate-400">
							step {actStepNo} of {actSteps.length}
						</span>
					</h3>
					<p className="text-xs leading-relaxed text-slate-700">
						<span className="font-semibold text-indigo-600">Do: </span>
						{step.click}
					</p>
					<blockquote className="rounded-lg border-l-4 border-indigo-400 bg-indigo-50 px-3 py-2 text-xs italic leading-relaxed text-slate-800">
						“{step.say}”
					</blockquote>
					{step.expect && (
						<p className="inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
							Expect: {step.expect}
						</p>
					)}
					{step.terminal && (
						<code className="block rounded-lg bg-slate-900 px-3 py-2 font-mono text-[11px] text-emerald-300">{step.terminal}</code>
					)}
					<div className="flex items-center justify-between pt-1">
						<button
							onClick={() => setIndex(0)}
							className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
						>
							Restart
						</button>
						<NavButtons index={index} go={go} />
					</div>
				</div>
			)}
		</div>
	);
}

function NavButtons({ index, go }: { index: number; go: (delta: number) => void }) {
	return (
		<div className="flex gap-1.5">
			<button
				onClick={() => go(-1)}
				disabled={index === 0}
				className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
			>
				← Prev
			</button>
			<button
				onClick={() => go(1)}
				disabled={index === PRESENTER_SCRIPT.length - 1}
				className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
			>
				Next →
			</button>
		</div>
	);
}
```

- [ ] **Step 2: Wire into App.tsx — import + state**

In `web/src/App.tsx`, add after the existing imports (line 6):

```tsx
import PresenterMode from "./components/PresenterMode";
```

and inside `App()`, directly under `const [tab, setTab] = useState<Tab>(tabFromHash);` (line 66):

```tsx
	const [presenterOpen, setPresenterOpen] = useState(false);
```

- [ ] **Step 3: Wire into App.tsx — header toggle button**

In `web/src/App.tsx`, immediately after the "Live" badge `<div>` (the block ending at line 106, `Live` + `</div>`), add:

```tsx
							<button
								onClick={() => setPresenterOpen((v) => !v)}
								className={`rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur transition-colors ${
									presenterOpen
										? "border-indigo-300/60 bg-indigo-500/30 text-white"
										: "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
								}`}
							>
								Presenter
							</button>
```

- [ ] **Step 4: Wire into App.tsx — mount the panel**

In `web/src/App.tsx`, directly before `<ChatWidget />` (line 134), add:

```tsx
			<PresenterMode open={presenterOpen} onClose={() => setPresenterOpen(false)} />
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run check:web && npm run build:web`
Expected: both clean; `web/dist` rebuilt.

- [ ] **Step 6: Smoke-test locally (requires dev server)**

Run: `npm run dev` (background), open `http://localhost:8787`, click **Presenter**, advance through all 27 steps with **Next**.
Expected: the app switches tabs on its own for steps with a tab; the counter reads `N / 27`; refresh mid-walkthrough resumes at the same step; ✕ closes and the header button reopens at the same step.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/PresenterMode.tsx web/src/App.tsx web/dist
git commit -m "feat(web): Presenter Mode — on-screen guided demo walkthrough"
```

---

### Task 4: Redeploy, update docs, final verification

**Files:**
- Modify: `AGENTS.md` (Dashboard bullet under "Architecture invariants")
- Modify: `DEMO_GUIDE.md` (note in §2 pre-demo checklist)

**Interfaces:**
- Consumes: built `web/dist` from Task 3; the `$SITE` URL and account env var from Task 1.
- Produces: live site serving Presenter Mode; docs current per project convention.

- [ ] **Step 1: Update AGENTS.md**

In `AGENTS.md`, in the dashboard bullet under "Architecture invariants" (the bullet starting "- Dashboard: hash-routed tabs"), append at the end of that bullet, after "premium header + chat widget (indigo/violet gradient brand, Ghana tricolor hairline)":

```
  Presenter Mode (header "Presenter" button): floating step-by-step demo
  walkthrough panel, script in web/src/presenter/script.ts — keep it in sync
  with DEMO_GUIDE.md.
```

- [ ] **Step 2: Update DEMO_GUIDE.md**

In `DEMO_GUIDE.md` §2 ("Pre-demo checklist"), after the paragraph beginning "Open **http://localhost:8787**", add:

```markdown
**On-screen option:** the dashboard has a built-in **Presenter Mode** — click
"Presenter" in the header (top right) and a panel walks you through every step
below: what to click, the exact line to say, and the number to expect. It
navigates the tabs for you as you advance, and remembers your place if the page
refreshes. This guide remains the full reference; Presenter Mode is the
in-the-moment version of it.
```

- [ ] **Step 3: Run backend tests (unchanged, must stay green)**

Run: `npm test`
Expected: 32 tests pass.

- [ ] **Step 4: Redeploy**

```bash
CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538 npx wrangler deploy
```

Expected: deploy succeeds on the same `https://iie.<subdomain>.workers.dev` URL.

- [ ] **Step 5: Verify Presenter Mode on the live site**

Open the live URL in a browser. Click **Presenter** in the header. Advance through several steps (at minimum: the Act 1 → Act 2 transition, one chatbot step, one My Leave step).
Expected: tab navigation follows the steps; expected numbers on screen match the live seeded data (22 violations, 3.3d median, 150 employees); position survives a refresh.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md DEMO_GUIDE.md
git commit -m "docs: document Presenter Mode in AGENTS.md and demo guide"
```

---

## Self-Review Notes

- **Spec coverage:** Part A steps 1–6 → Task 1. Part B script file → Task 2; panel component → Task 3; header toggle + mount → Task 3; build + redeploy → Tasks 3–4; AGENTS.md/DEMO_GUIDE.md updates → Task 4; verification (typecheck, tests, live walkthrough) → Tasks 2–4. No gaps.
- **Placeholders:** none — all commands, file contents, and edits are written out in full.
- **Type consistency:** `PresenterStep` fields (`id`, `act`, `tab`, `title`, `click`, `say`, `expect?`, `terminal?`) and exports (`PRESENTER_SCRIPT`, default `PresenterMode({ open, onClose })`) are used identically in Tasks 2, 3. Tab ids match `App.tsx`'s `TABS` (`operations`, `intelligence`, `decision`, `leave`).
