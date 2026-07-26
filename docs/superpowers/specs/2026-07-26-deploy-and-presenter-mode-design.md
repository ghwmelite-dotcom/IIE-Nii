# Deploy to Cloudflare + Presenter Mode — Design

**Date:** 2026-07-26
**Goal:** Make the IIE supervisor presentation as easy as possible for the presenter:
(1) the site is live at a public URL (no dev server needed on demo day), and
(2) a "Presenter Mode" inside the dashboard walks the presenter through the demo
step by step — what to click, what to say, what number to expect.

## Part A — Deploy to Cloudflare (Ghwmelite account)

### Context

- Wrangler is authenticated via OAuth (user `ohcsghana.main@gmail.com`) with access
  to two accounts. Deployment target: **Ghwmelite@gmail.com's Account**
  (`ea2eb3a9813660dfca2a60e594858538`).
- The D1 database (`iie-event-log`, id `14cf9a00-…`), Vectorize index
  (`iie-policy-index`), and R2 bucket (`iie-policy-docs`) referenced in
  `wrangler.jsonc` were provisioned under the **other** account. Account-scoped
  resources do not transfer, so fresh ones must be created in the Ghwmelite account.
- Local dev is unaffected: local D1/KV are used with `--local`; the KV placeholder
  id already only works locally today.

### Steps

1. **Target the account** for every provisioning/deploy command via
   `CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538` (env var, not a config
   change, so the default account stays untouched).
2. **Provision resources** (same names as existing, new account):
   - `wrangler d1 create iie-event-log` → put the new `database_id` in `wrangler.jsonc`
   - `wrangler kv namespace create CONFIG` → replace `"local-config-placeholder"` with the real id
   - `wrangler vectorize create iie-policy-index --dimensions=768 --metric=cosine`
   - `wrangler r2 bucket create iie-policy-docs`
   - `wrangler secret put API_KEY` (generate/reuse the dev key value)
3. **Migrate**: `npm run db:migrate:remote`
4. **Deploy**: `npm run deploy` → `https://iie.<ghwmelite-subdomain>.workers.dev`.
   Enable the workers.dev subdomain on the account first if not already enabled.
5. **Seed remote**: `npm run seed -- --base https://iie.<subdomain>.workers.dev --key <API_KEY>`
   — full dataset (150 staff, 9 units, 6 months, ~33,300 events) plus policy corpus
   ingestion into R2/Vectorize via `/api/chatbot/ingest`.
6. **Verify**: `curl` `/health` and `/api/stats/overview` on the live URL (expect
   ~150 employees, ~33,300 events), open all four dashboard tabs, and run
   `npm run validate -- --base <url>` if the validate script supports a base flag
   (check `scripts/validate.mjs`; otherwise spot-check manually).

### Config changes

`wrangler.jsonc`: only `database_id` and the KV `id` values change. Everything else
(names, bindings, crons, assets) stays as-is. After editing, run `npm run types` to
regenerate `worker-configuration.d.ts` (ids are config, not types, but cheap to keep
the habit per AGENTS.md).

## Part B — Presenter Mode (guided demo in the app)

### Overview

A floating panel inside the React dashboard that turns `DEMO_GUIDE.md` into an
on-screen, step-by-step walkthrough. The presenter never looks away from the screen,
cannot lose their place, and anyone can present on short notice.

### Components

**1. Script data — `web/src/presenter/script.ts` (new)**

A typed array of steps distilled from DEMO_GUIDE.md (30-second pitch + Acts 1–5,
optional Act 6). Roughly 24 steps. Each step:

```ts
type PresenterStep = {
  id: string;            // "act2-step3"
  act: string;           // "Act 2 — Process Intelligence"
  tab: string;           // hash route to navigate to: "#operations" | "#intelligence" | "#decision" | "#leave" | "" (stay)
  title: string;         // "The discovered process map"
  click: string;         // what to click / do on screen
  say: string;           // the exact line to say, quoted from the demo guide
  expect?: string;       // the number to expect, e.g. "median 3.3d, P95 5.7d"
  terminal?: string;     // optional terminal command (Act 6), display only
};
```

Content is adapted verbatim from `DEMO_GUIDE.md` §§1, 4–9 so the panel and the
printed guide never disagree.

**2. Panel UI — `web/src/components/PresenterMode.tsx` (new)**

- Toggle: a "Presenter" button in the app header (next to existing header controls).
- Panel docked bottom-left (the chat widget owns bottom-right), above content.
- Shows: act label, step counter ("3 / 4"), title, the click instruction, the
  say-line styled as a quote, the `expect` chip when present, and Prev / Next.
- **Next/Prev also navigates the app**: advancing to a step whose `tab` differs sets
  `location.hash`, so the screen changes with the script.
- Step index persisted in `localStorage` (key `iie-presenter-step`) — an accidental
  refresh resumes where the presenter was. A "Restart" button resets to step 0.
- Collapsible to a mini-bar (act + title + prev/next) so it doesn't cover panels
  during long segments.
- Styling: Tailwind, matching the existing indigo/violet brand; no new dependencies.

**3. Wiring — `web/src/App.tsx` (or equivalent root component)**

Mount the toggle button + panel. No changes to any existing tab component, hook, or
route. Presenter Mode is read-only with respect to app state.

### Build & ship

`npm run build:web`, `npm run check:web`, then a second `npm run deploy` so the live
site includes Presenter Mode. Update `AGENTS.md` (dashboard bullet) and
`DEMO_GUIDE.md` (mention Presenter Mode as the on-screen alternative) to keep docs
current per project convention.

### Out of scope (YAGNI)

- No auto-clicking or scripted DOM manipulation — the presenter still clicks things
  themselves (live clicks are the demo's credibility).
- No slide deck, no video, no printable script (rejected options 1, 2, 4).
- No presenter-mode state sync across devices.

### Verification

- `npm run check:web` clean; `npm test` still green (32 tests — no backend changes).
- Manual walkthrough: open the deployed URL, enable Presenter Mode, advance through
  every step; confirm each step's tab lands on the right screen and the expected
  numbers match the live seeded data.
