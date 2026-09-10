# Team Care — Vercel migration (draft; not production-ready)

This branch replaces the Cloudflare Worker and D1 runtime with a Vercel Node.js function and Postgres. PR #6 must stay unmerged until a deployed preview passes real browser sign-in and request testing. No preview has been verified yet.

## Runtime

Root `npm ci && npm run build` creates only the restaurant's existing public files in `public/`. Team Care's 23 assets are embedded in a server module and never copied to that public directory. `/benefits/*` rewrites to `api/team-care.js`. Employee and leader authorization run before protected assets or APIs are served. Root `vercel.json` is the proposed native routing for the preview; it must not reach production before validation.

Postgres uses `pg` with a bounded pool. Request creation/deduplication and daily limits use transactions and advisory locks; status updates and audit insertions commit together. Database operations use bound values. Notification retries retain the original provider idempotency key and do not imply delivery. Groq remains a constrained category selector, not a booking or payment agent.

## Authentication and secrets

No identity request headers are trusted. Employees enter the shared password; leaders enter an individual email/password. Passwords are verified with salted scrypt hashes. HMAC-signed, eight-hour Secure/HttpOnly/SameSite cookies grant sessions. Every leader request checks active Postgres membership and the current password-hash version. Removing a leader or rotating their hash revokes access. Rotating the session signing secret revokes all sessions. Login attempts are throttled in Postgres by account (employee login uses a shared bucket); this favors protection over availability and can temporarily lock the shared login after ten attempts.

Configure only environment variables, separately for Preview and Production:

- APP_ORIGIN: exact HTTPS origin of that deployment, without a trailing slash. No automatic trust of Host or forwarded headers for the auth origin.
- DATABASE_URL: TLS-enabled pooled Neon or Supabase Postgres URL. Preview must use a separate database with synthetic records.
- TEAM_SESSION_SECRET: at least 32 cryptographically random characters; separate per environment.
- TEAM_PASSWORD_HASH: salted scrypt hash of the existing employee password.
- LEADER_PASSWORD_HASHES: JSON mapping each approved lowercase leader email to its own salted scrypt hash. Never reuse the employee password for a leader account. Generate/deliver individual credentials securely.
- RESEND_API_KEY and NOTIFY_FROM: verified email sender. Intake remains disabled until configured. Uniform requests include 06123@chick-fil-a.com.
- GROQ_API_KEY, GROQ_MODEL and GROQ_ENABLED: model selected in the connected account; leave disabled until configured and tested.

Use `hashPassword` from `server/auth.js` in a secure provisioning environment; never commit passwords, hashes, session keys, database URLs or employee exports. There is no public registration or automatic elevation. Seed `care_leaders` through authorized database administration. Preserve approved emails `t@cfahueytown.com` and `06123@chick-fil-a.com`.

## Data migration

`DATABASE_URL=... npm run db:migrate` creates schema once, under an advisory transaction lock. It does not drop or overwrite existing tables.

Source inspected September 10, 2026: care_requests 0 rows; care_audit 0; care_ai_budget 0; care_usage 3. These are inspection-time counts, not proof of a final migrated state. Source leader allowlist contains the two emails above, stored as configuration rather than a D1 table. Identity headers/sessions are deliberately not migrated; leaders need real new credentials.

Before cutover, pause source writes, re-export all four tables and append care_leaders as an array of `{email, active:true}` objects. Keep the export in restricted storage outside Git. Require all columns, including is_test; do not drop IDs, assignments, revisions, notification metadata, or audits. Set MIGRATION_INPUT to that JSON path and MIGRATION_CONFIRM=source-frozen; run `npm run db:import` against the empty production destination. It imports all five tables in one transaction, verifies every value and row count, and rejects orphan audits or a nonempty destination. It sends no emails. If validation fails, it rolls back. Never put production employee records into the preview database.

Actual destination provisioning and import are BLOCKED until Neon/Supabase and Vercel are connected. No data migration is claimed complete.

## Required preview acceptance (all pending unless indicated)

1. Connect the existing Vercel project to the PR branch; create an isolated preview Postgres database and set Preview environment variables. Deploy, set APP_ORIGIN to the exact generated preview origin, then redeploy if necessary.
2. Initialize schema and seed approved leader accounts with individually provisioned credentials.
3. Open the clickable HTTPS preview in a real browser. Wrong employee password fails; correct password opens the portal. Navigation, images, mobile layout, logout and reload work under /benefits/.
4. Employee session cannot open leader records or admin APIs. Forged identity headers do not grant access. Individual leader login succeeds; removed leader loses access. Cross-origin mutation fails.
5. Submit a synthetic employee request through the actual browser form. Verify persistence after reload, correct leader visibility, assignment/status changes and audit entries. Duplicate submission must not duplicate the request or notification. Check email receipt, not just provider acceptance, with an authorized test recipient.
6. Test a uniform request reaches 06123@chick-fil-a.com, using an explicitly approved test email; verify no cash request path exists.
7. Test Groq success, consent refusal and failure fallback. Confirm keys are absent from page source and network responses.
8. Record preview URL, tested commit, browser/date, actual outcomes and remaining issues in PR #6. Request Tim's review. Do not merge based on local automated tests alone.
9. After approval, freeze/export/import production data and verify it; deploy native routing; repeat production smoke checks. Keep the old portal available during transition. Roll back routing if needed; reconcile any new destination records before returning intake to the source.

## Validation performed

Build passed. Seven automated tests passed, including scrypt/session tampering and revocation, spoofed headers, role isolation and request/audit transactions on local PGlite (Postgres engine). Email was mocked. This is not hosted Postgres, Vercel, real-browser, real-email, or real-Groq validation.
