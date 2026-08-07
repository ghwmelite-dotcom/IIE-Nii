# IIE Deployment Runbook (Milestone A — Identity & RBAC)

Deploys the auth/RBAC milestone to **staging** first, then **production**. Run each numbered step and verify before moving on. All commands run from the repo root.

> Cloudflare account: **ghwmelite@gmail.com** (`CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538`). The account login has multiple accounts, so **pin the account id** on every wrangler command (examples below use an env var).
>
> Live production worker is **`iie`** at `https://iie.ghwmelite.workers.dev`. The steps keep production on that same worker/URL.

```bash
# PowerShell: $env:CLOUDFLARE_ACCOUNT_ID = "ea2eb3a9813660dfca2a60e594858538"
# bash:       export CLOUDFLARE_ACCOUNT_ID=ea2eb3a9813660dfca2a60e594858538
```

---

## 0. One-time `wrangler.jsonc` fixes (replaces the placeholder ids)

The branch ships `wrangler.jsonc` with **placeholder** KV ids and empty `EMAIL_SENDER`. Before deploying, edit it:

1. **Pin each env's worker name** so production stays `iie` (not `iie-production`):
   - In `env.staging` add `"name": "iie-staging"`.
   - In `env.production` add `"name": "iie"`.
2. Replace the placeholder KV ids with the real ones you create in step 1 below (`staging_auth_placeholder`, `staging_config_placeholder`, `prod_auth_placeholder`, `staging_d1_placeholder`).
3. Leave `EMAIL_SENDER` as `""` for now (staging logs codes; production sender set in step 6). `src/lib/email.ts` fails closed if it's unset in production — that's intended until the domain is verified.

---

## 1. Create Cloudflare resources

### Staging (all new)
```bash
npx wrangler kv namespace create AUTH --env staging          # → paste id into env.staging AUTH
npx wrangler kv namespace create CONFIG --env staging        # → paste id into env.staging CONFIG
npx wrangler d1 create iie-event-log-staging                 # → paste database_id into env.staging DB
npx wrangler r2 bucket create iie-policy-docs-staging
npx wrangler vectorize create iie-policy-index-staging --dimensions=768 --metric=cosine
```
### Production (only AUTH is new — the rest already exist and are wired)
```bash
npx wrangler kv namespace create AUTH --env production        # → paste id into env.production AUTH
```
Commit the `wrangler.jsonc` id updates.

---

## 2. Set secrets (per environment)

```bash
# Generate a strong session secret, e.g. (bash): openssl rand -hex 32
npx wrangler secret put SESSION_SECRET --env staging
npx wrangler secret put API_KEY        --env staging     # the RFID/webhook/M2M key
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret put API_KEY        --env production
```
Use a **different** `SESSION_SECRET` per environment. Reuse/rotate `API_KEY` as your subsystem producers require.

---

## 3. Apply migrations

```bash
npx wrangler d1 migrations apply iie-event-log-staging --remote --env staging
# Production DB already exists and holds live data — 0003 only ADDS tables (safe, idempotent):
npx wrangler d1 migrations apply iie-event-log --remote --env production
```

---

## 4. Build & deploy to STAGING

```bash
npm run build:web
npx wrangler deploy --env staging
```
Deploys `iie-staging` at `https://iie-staging.ghwmelite.workers.dev`.

---

## 5. Smoke-test STAGING (email not required yet — codes are logged)

In one terminal: `npx wrangler tail --env staging`. Then:
1. `POST /auth/request-code` with a **provisioned** email (see step 7) — the OTP appears in the tail log (`otp email (dev)`).
2. `POST /auth/verify` with that code → sets the session cookie.
3. `GET /auth/me` → returns your roles/capabilities.
4. Confirm an **unauthenticated** `GET /api/stats/overview` returns **401**.
5. Confirm an RFID `POST /api/attendance/clock-in` **without** `x-api-key` returns **401**, and **with** the key returns **201**.

Do not proceed to production until staging passes.

---

## 6. Configure the production email sender (required before prod login works)

OTP email needs a **Cloudflare-verified sender domain** (SPF/DKIM/DMARC). The app is on `workers.dev`, so:
- Add a domain (or subdomain) to Cloudflare and set up **Email** (MailChannels via Workers, or a transactional provider) with DKIM/SPF/DMARC records.
- Set the sender address:
  ```bash
  npx wrangler secret put EMAIL_SENDER --env production   # e.g. no-reply@ohcs.gov.gh
  ```
  (Prefer a secret over the `vars` key so it's never blank in config.)
- If you deploy production before this is done, sign-in will fail closed (by design) — finish this step first.

---

## 7. Provision users & bootstrap the first admin (staging, then prod)

Bootstrap one `system_admin` bound to the maintainer's email (repeat with `--env production`):
```bash
npx wrangler d1 execute iie-event-log-staging --remote --env staging --command \
 "INSERT INTO users (user_id,email) VALUES ('bootstrap-admin','<maintainer-email>'); \
  INSERT INTO user_roles (user_id,role_id) VALUES ('bootstrap-admin','system_admin');"
```
Then sign in as that admin and use **Administration → Provision from directory** to create user rows for all employees (default `employee` role). Review the "without email" report and fix `employees.email` gaps, then re-provision. Assign area roles (`hr_admin`, `process_analyst`, `executive`) and confirm approver employees' org `role`/`department` are correct (these drive leave eligibility).

---

## 8. Deploy to PRODUCTION

Only after staging is verified and the email sender is configured:
```bash
npm run build:web
npx wrangler deploy --env production          # worker "iie" at https://iie.ghwmelite.workers.dev
```
Post-deploy checks: unauthenticated `GET /api/stats/overview` → 401; sign-in with a real emailed code works; the RFID webhook accepts the API key; a full leave chain runs under real identities.

---

## Notes
- `git push` does **not** deploy (no CI wired) — deployment is always `wrangler deploy` per this runbook.
- Milestone B (Decision Support 2.0 + reporting + bottleneck-to-top) is a separate spec/plan/PR.
