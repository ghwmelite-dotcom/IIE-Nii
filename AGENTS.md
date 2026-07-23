# IIE — Intelligent Integration Engine (project memory)

OHCS (Office of the Head of Civil Service, Ghana) process intelligence platform.
One Cloudflare Worker (Hono) + D1 + Workers AI + Vectorize + R2 + KV, React SPA
served as static assets. Requirements: `IIE_PRD.pdf`.

## Commands

```sh
npm run dev                 # http://localhost:8787 — API + dashboard together
npm run seed -- --reset     # ALWAYS use --reset: seed is additive, duplicates otherwise
npm run validate            # PRD §13 metrics — must stay 6/6 (needs dev server + seed)
npm test                    # vitest in Workers runtime — must stay green (32 tests)
npm run check / check:web   # typechecks
npm run build:web           # rebuild dashboard into web/dist (required after web/src edits)
npm run types               # regenerate worker-configuration.d.ts after binding changes
```

PDF docs: `.venv-pdf/Scripts/python scripts/build_demo_pdf.py <input.md> <out.html>`,
then headless Edge `--print-to-pdf`. (`.venv-pdf` + generated HTML are gitignored.)

## Domain model (hard-won, don't regress)

- **Org:** 9 units keyed by real acronyms — directorates RSIMD, PBMED, CMD, F&A, RTDD;
  units RCU, CSC, IAU, PR. 150 staff total: Director + Deputy Director + Assistant
  Director I per unit (management/middle mgmt), 122 lower-grade officers, 1 HR officer
  in CMD. OHCS has NO "manager" role — first approval step is `supervisor_review`.
- **Leave chains** (src/lib/workflow.ts, enforced AND audited from this one model):
  - standard (annual/sick/maternity/casual): supervisor_review (own unit, line_manager)
    → fa_verification (admin_officer in F&A) → director_fa_approval (director in F&A)
  - study only: supervisor_review → rtdd_review (schedule_officer in RTDD)
    → director_rtdd_approval (director in RTDD)
  - Seed designations: DEP-F&A = admin_officer, DEP-RTDD = schedule_officer
    (deputy-director rank; keeps headcount 150).
- Step names in workflow.ts, conformance.ts (chain picked per case by RTDD activities),
  stats.ts pipeline SQL, Operations.tsx stage list, MyLeave.tsx STEPS, seed events,
  validate.mjs ground truth, and tests must ALL stay in sync.

## Architecture invariants

- Everything downstream derives from the `events` table (canonical schema in
  src/lib/events.ts). Analysis tables are append-only per mining run; readers take
  the latest run.
- Auth: API key (x-api-key) on machine endpoints only (src/lib/auth.ts); reads are open.
- Mining: DFG + heuristic dependency measure (graph.ts); bottleneck medians vs
  per-source thresholds from KV `CONFIG[bottleneck_thresholds_ms]` with
  DEFAULT_FLAG_THRESHOLDS_MS fallback; conformance = skipped_step/out_of_order vs
  prescribedChain(type).
- Chatbot: hybrid intent (keyword rules for personal data — never LLM; llama-3.2-3b
  classifies the rest); RAG over Vectorize (bge-base embeddings, 800-char chunks,
  top-3, 0.45 score floor) answered by llama-3.3-70b strictly from excerpts; leave
  dates only from the user's message. AI + Vectorize are remote even in dev.
- Dashboard: hash-routed tabs (#operations/#intelligence/#decision/#leave), SSE feed
  (/api/events/stream with polling fallback in hooks.ts useEventFeed), CaseTrace
  drill-down modal, EmployeePicker, LoadError banners, My Leave tab (submit/track +
  approver inbox), CSV/print export on Decision Support, premium header + chat widget
  (indigo/violet gradient brand, Ghana tricolor hairline).
- Seed plants ground truth: slow `supervisor_review → fa_verification` (~3.3d median),
  10% supervisor-bypass violations (22/256 cases). validate.mjs measures against this.
- DB wipe order (FK-safe): events, attendance_records, leave_requests,
  workflow_transitions, process_models, bottlenecks, conformance_results, employees,
  departments.

## Docs

`README.md` (build/run), `DEMO_GUIDE.md` + `IIE_Demo_Guide.pdf` (supervisor demo
script), `IIE_TECHNICAL_REPORT.md` + `IIE_Technical_Report.pdf` (thesis companion,
references verified). Regenerate PDFs after content/data changes.

## Deferred (roadmap)

Cloudflare Access/SSO identity, queue fanout (Workers Paid), AI narrative over
recommendations, prescribed conformance model into KV, loop-aware DFG refinements.
