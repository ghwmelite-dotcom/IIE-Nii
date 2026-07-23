# IIE — Intelligent Integration Engine

Event-driven process intelligence platform for OHCS, built on Cloudflare
(Workers + D1, Queues/Workers AI/Vectorize in later phases). See `IIE_PRD.pdf`.

One Worker, modular routes — split into separate Workers only if a module outgrows it.

## Layout

- `src/index.ts` — Worker entrypoint (Hono). Ingestion + trace endpoints.
- `src/lib/events.ts` — canonical event schema (zod) + D1 insert helpers.
- `migrations/` — D1 schema (events log, employees, departments, attendance, leave).
- `scripts/seed.mjs` — synthetic event generator (attendance, leave chains, chatbot).

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

## Endpoints (phase 1)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/events` | Ingest one canonical event |
| POST | `/api/events/batch` | Ingest up to 1000 events (seeding, bursts) |
| GET | `/api/events?case_id=X` | Event trace for a case, chronological |
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

- Subsystem routes (attendance clock-in/out, leave state machine, chatbot)
- Queue fanout from ingestion (requires Workers Paid plan)
- Process mining (heuristic miner, bottlenecks, conformance) on a cron trigger
- React dashboard as Workers static assets
