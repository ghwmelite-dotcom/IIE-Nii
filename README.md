# IIE — Intelligent Integration Engine

Event-driven process intelligence platform for OHCS, built on Cloudflare
(Workers + D1, Queues/Workers AI/Vectorize in later phases). See `IIE_PRD.pdf`.

One Worker, modular routes — split into separate Workers only if a module outgrows it.

## Layout

- `src/index.ts` — Worker entrypoint (Hono) + cron `scheduled` handler (mining 6-hourly, daily checks 18:43 UTC).
- `src/lib/events.ts` — canonical event schema (zod) + D1 insert helpers.
- `src/lib/workflow.ts` — leave approval state machine (steps, roles, transitions).
- `src/mining/` — process intelligence: DFG builder, bottleneck stats, conformance checker, job orchestrator.
- `src/jobs/daily.ts` — missing clock-out anomalies + 48h leave-step escalations.
- `src/routes/` — `intelligence`, `attendance`, `leave`, `org` sub-apps.
- `migrations/` — D1 schema (events log, org tables, analysis tables).
- `scripts/seed.mjs` — imports the org directory, then generates synthetic events (attendance, leave chains, chatbot).

## Develop

```sh
npm install
npm run db:migrate:local   # create + migrate local D1
npm run dev                # http://localhost:8787
npm run seed -- --employees 10 --months 1   # smoke-test dataset
npm run seed               # full dataset: 50 employees, 6 months
npm run check              # typecheck
```

Regenerate `worker-configuration.d.ts` after changing bindings: `npm run types`.
Crons: mining every 6h, daily checks 18:43 UTC (Accra = UTC). Trigger mining on
demand with `POST /api/intelligence/run`; test either cron path via
`wrangler dev --test-scheduled` +
`curl "http://localhost:8787/__scheduled?cron=43 18 * * *"`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/events` | Ingest one canonical event |
| POST | `/api/events/batch` | Ingest up to 1000 events (seeding, bursts) |
| GET | `/api/events?case_id=X` | Event trace for a case, chronological |
| POST | `/api/attendance/clock-in` | RFID tap-in (card_id or employee_id) |
| POST | `/api/attendance/clock-out` | RFID tap-out |
| GET | `/api/attendance/:id/summary` | Employee attendance summary |
| POST | `/api/leave/request` | Submit a leave request |
| POST | `/api/leave/:id/transition` | approve / reject (with reason) / cancel |
| GET | `/api/leave/:id/status` | Request status + transition history |
| POST | `/api/org/import` | Bulk upsert departments + employees |
| GET | `/api/intelligence/process-map?source=` | Latest discovered process model (DFG + variants) |
| GET | `/api/intelligence/bottlenecks?source=` | Transition duration stats, flagged pairs first |
| GET | `/api/intelligence/conformance` | Deviations vs. the prescribed leave workflow |
| POST | `/api/intelligence/run` | Run the mining job on demand |
| GET | `/health` | Liveness |

## Deploy

The D1 database `iie-event-log` is already provisioned (ID in `wrangler.jsonc`)
and its schema is migrated. Deploying publishes the API at a public
`*.workers.dev` URL — note there is no auth on the endpoints yet (Phase 4 adds
Cloudflare Access / JWT).

```sh
npm run deploy
npm run seed -- --base https://iie.<your-subdomain>.workers.dev
```

## Next phases

- Chatbot (Workers AI + Vectorize RAG over policy docs in R2)
- Queue fanout from ingestion (requires Workers Paid plan)
- React dashboard as Workers static assets
- Auth (Cloudflare Access / JWT); prescribed-model + thresholds into KV config; AI recommendations
