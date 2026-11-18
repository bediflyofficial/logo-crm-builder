# Phase 6 final security audit and deployment readiness

Audit date: 2026-11-18 (UTC)

## Verdict

**NOT READY for a controlled production rollout yet.** The reviewed tenant-authorization, credential-storage, consent, delivery-mode, webhook and worker controls are present, and the table-grant issue found during this audit is fixed. Release remains blocked by unresolved dependency vulnerabilities, incomplete live Meta acceptance, an unfinished deep code scan, and the inability to rerun the fixture-based database suite with the current sandbox database role.

No application was published or deployed, production CAPI was not enabled, and no customer conversion event was transmitted.

## Security findings

### Fixed in Phase 6

**Broad table-level privileges on conversion rules and delivery history.** The live database granted anonymous and authenticated roles all table privileges on `meta_conversion_delivery_attempts` and `meta_conversion_rules`. Existing row-level security still restricted rows and operations, so this was a least-privilege defect rather than evidence of a tenant-data breach.

Migration `0025_tighten_meta_conversion_table_grants.sql` now makes the effective grants:

- Delivery history: authenticated `SELECT` only; anonymous no privileges; server role full access.
- Conversion rules: authenticated `SELECT`, `INSERT`, `UPDATE`, `DELETE` only; anonymous no privileges; server role full access.
- Existing workspace-admin row-level policies remain unchanged.

The new read-only `src/test/sql/meta-security-grants.sql` passed against the live effective grants. A direct database read-back confirmed exactly the intended privileges.

### Open release blockers

1. **Dependency scan: 12 high and 8 moderate findings.** The report covers direct and transitive packages, not 20 independently proven exploit paths. Affected parents include `zod@3.25.76`, `exceljs@4.4.0`, `@tanstack/react-start@1.168.60`, `@tanstack/react-router@1.170.41`, `@tanstack/router-plugin@1.168.42`, and `@tailwindcss/vite@4.3.3`. Advisories concern Zod oversized-collection memory exhaustion, js-yaml/source-map-js/picomatch/brace-expansion denial of service, Seroval injection issues, and a uuid buffer-bounds issue. Upgrade the direct package where supported and the affected transitive dependency versions in the lockfile, then rerun all tests and scans. These findings were not hidden or marked fixed.
2. **Deep code security scan has not returned findings yet.** The quick database scan completed with no issues. The deep scan was started, but no `agent_security_v2` result was available when this report was prepared; it is not counted as passed.
3. **No live Meta acceptance evidence.** The database currently contains zero CAPI configurations, zero connected Facebook accounts, zero consent records, zero production or test conversion events, and zero provider receipts. Real OAuth, asset discovery, Page/form access, lead synchronization, Dataset access and Meta event acceptance therefore remain unverified in this phase.
4. **Current fixture-based SQL rerun is blocked by the sandbox role.** The first rerun attempt failed transient authentication. The retry connected but could not insert rollback-only workspace fixtures because the role lacks `organizations` insert permission. This is a test-environment permission blocker, not a passing result and not evidence of an application assertion failure. The Phase 2/4/5 reports record earlier successful rollback runs, but those earlier passes are not represented as new Phase 6 passes.
5. **Scheduled execution history could not be inspected.** The one-minute `bedifly-meta-lead-sync` schedule is active and targets `/api/public/meta/process` with `{"kind":"all"}`. The scheduler tool does not expose run history here, and direct cron-internals inspection is disallowed. Endpoint authentication and schedule configuration passed; actual scheduled run completion remains unverified.

### Controls reviewed and found present

- Every one of the 27 browser-facing Meta actions has explicit platform-admin or workspace-admin authorization. All-client overview/analytics and platform configuration/monitoring actions require Super Admin. Workspace actions repeat `is_org_admin` on the Lovable backend for every request.
- Sales executives are not workspace admins and cannot call these Meta administration actions. Their existing assigned-lead CRM permissions are separate and remain covered by database policies.
- Credential, OAuth-session and raw-webhook tables have no browser table grants. Browser-readable connection columns exclude encrypted tokens. CAPI credentials and Page credentials remain server-only and use AES-256-GCM encryption.
- OAuth state is random, hashed at rest, bound to user/workspace/redirect, expires after ten minutes and is consumed once. The callback returns only to an approved opener origin and does not require or receive the CRM session.
- Webhook verification uses the backend verify token. POST requires a valid `X-Hub-Signature-256` HMAC-SHA256 signature over the original body, uses a timing-safe comparison and limits payloads to 1 MiB before inbox storage.
- Worker requests require the scheduler Bearer credential using timing-safe digest comparison. Conversion claim/complete/reserve functions and analytics are not executable by anonymous or authenticated browser roles.
- Consent checks require original event-time and latest advertising plus matching-data acceptance. Withdrawal, Global Privacy Control, missing consent, inactive workspace, changed Dataset, missing eligibility review and disabled production all block sending. Consent/configuration is checked before reading customer matching fields and again immediately before POST.
- Email and E.164 phone matching fields are normalized and SHA-256 hashed. Raw customer matching data is not placed in analytics, delivery history or safe failure codes. The original event UUID and timestamp are retained, and the reserved Dataset cannot be rerouted.
- Test and production delivery are separated by reservation functions, the event flag and worker filters. Test events cannot enter the production worker. Production requires explicit workspace-admin enablement after a successful test and Dataset eligibility review; no worker code enables it.
- Retry policy uses database leases and stable event IDs. Automatic retries are limited to eight attempts, use 60-second exponential backoff capped at one hour, and rate-limit backoff starting at five minutes capped at six hours. Permanent, timeout, expired-lease and uncertain-receipt outcomes do not automatically replay. Invalid tokens pause only the affected workspace. Manual retry requires workspace-admin authorization.
- Analytics returns aggregate counts/rates/dates/workspace names only. It excludes access tokens, customer fields and raw provider responses, and separates test from production.
- Raw provider response bodies are not returned. Meta transport redacts credential echoes from provider error strings. Provider-derived error message text can still appear in admin-only sync history for diagnosis; this is not a raw response or credential, but should remain covered by log/access reviews.
- No privileged server-key imports or Meta encryption/server-secret references were found in browser components or non-API routes. No credential files are tracked in Git.

## Test results

### Passed in Phase 6

- Full Vitest suite: **168/168 tests passed across 14 files; 0 failed, 0 skipped** (final run: 7.14 seconds).
- New read-only database privilege test: **passed** (`BEGIN`, `DO`, `ROLLBACK`). It checks anonymous denial, browser table privileges, server-only credential/webhook tables and privileged function grants.
- Live preview negative endpoint checks: **8/8 passed**:
  - Meta action without a user token: 401.
  - Untrusted action origin: 403.
  - Untrusted CORS preflight: 403.
  - Unknown action: 404.
  - Invalid webhook verification: 403.
  - Invalid webhook signature: 401.
  - Worker without scheduler authentication: 401.
  - Invalid OAuth callback state: 400.
- Database migration history inspection: **consistent, no findings** for entries `0000` through `0024`; `0025` was subsequently applied successfully and is present in the applied-migration records.
- Effective grant read-back after `0025`: **passed**.
- Latest harness production build after the migration: **build OK** at `2026-11-18T12:05:21Z`.
- Post-fix quick database security scan: **no issues found**; this does not replace the pending deep code scan or dependency remediation.
- Production-state read-back: **0 production-enabled configurations, 0 events, 0 receipts**.

### Earlier evidence retained, not rerun successfully in Phase 6

- Phase 2 rollback tests previously passed consent missing/granted/withdrawn, matching refusal, GPC, repeated transitions, bulk updates, two workspaces, sales-executive restrictions and deduplication.
- Phase 4 rollback tests previously passed two-Dataset selection, leases, duplicate-claim prevention, retries, invalid-token pause, manual retry, expired leases and withdrawal.
- Phase 5 rollback tests previously passed exact analytics calculations, date/type filters, production/test separation, Super Admin aggregation, empty states and direct-function denial.
- Phase 5 signed-in empty analytics screens previously returned HTTP 200; populated visual checks used intercepted fixtures, not live customer data.

### Failed, blocked or skipped

- Current Phase 2/4/5 fixture SQL rerun: **blocked by sandbox database permission**, as detailed above. No persistent fixture rows were created.
- Separate standalone TypeScript-check output: **not available in this turn**. The platform harness build passed; this report does not invent a separate typecheck result.
- Real Facebook OAuth and reconnect: **not tested**; no Facebook test account/session was available.
- Asset discovery, Page selection, lead-form access and real lead synchronization: **not tested live**; zero webhook jobs exist.
- Dataset save/test/eligibility and real QualifiedLead/Purchase Meta Test Events: **not tested**; no authorized test Dataset/token/Test Event Code is configured.
- Meta receipt verification: **not performed**; zero accepted receipts exist. No claim of real Meta delivery is made.
- Live two-workspace/two-Dataset acceptance: **not completed**; only prior rollback fixtures and current unit/authorization tests cover this behavior.
- Deep security scan: **pending**, not passed.
- Scheduler execution history: **unverified**.

## Reliability and migration review

- The existing `meta_conversion_events` table remains the only CAPI outbox; delivery attempts are history, not another queue. No duplicate lead or conversion queue was introduced.
- Atomic leases prevent simultaneous reservation and stale completion. Uncertain outcomes require manual review rather than blind replay.
- The worker processes one conversion event per scheduled invocation. This bounds runtime but limits nominal throughput to roughly 1,440 events/day before retries/failures; monitor backlog before a larger rollout.
- Migrations `0000`–`0025` are ordered consistently. Phase 1–5 migrations preserve the existing CRM tables and add Meta/CAPI controls incrementally; `0025` only tightens privileges.
- There is no automated down-migration/rollback path. Production rollback must use a tested backup/restore and compatibility plan; do not manually reverse security functions or grants during an incident without reviewing dependent code.
- No background process changes `capi_enabled`, Dataset eligibility or production status. Only the authorized admin action can explicitly enable production.

## Meta configuration still required

Verify in the Meta Developer App and Facebook Login for Business configuration, with the required access level/App Review where Meta requires it:

- `leads_retrieval`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_ads`
- `pages_manage_metadata`
- `ads_read`
- `business_management`

Also verify business-portfolio/Page/form access, the numeric Login Configuration ID, Dataset eligibility, and that the existing login configuration actually grants those permissions. App Review/Advanced Access cannot be established from repository code or the empty live integration records.

Configured callback URLs used by the implementation:

- OAuth: `https://lead-lantern-workspaces.lovable.app/api/public/meta/callback`
- Webhook: `https://lead-lantern-workspaces.lovable.app/api/public/meta/webhook`

## Deployment instructions after blockers are resolved

Do not perform these steps as approval to release now.

1. Remediate the dependency findings, obtain the completed deep-scan result, restore permission to run rollback-only database fixtures, and rerun all application, SQL, authorization and build checks.
2. Use a non-production test workspace and authorized test Dataset. Save its Dataset ID/token/Test Event Code, test access, review eligibility, and send one QualifiedLead and one Purchase through Meta Test Events. Require `events_received = 1` and visible accepted events in Meta Events Manager for both.
3. Repeat acceptance with two separate workspaces and different Datasets. Verify each workspace's event ID, original timestamp, hashed matching data, analytics and delivery history, and prove neither workspace can read, retry or send the other's events.
4. Verify real Facebook OAuth, required permissions, Page/form selection, webhook receipt and lead synchronization. Confirm the active scheduler completes runs and that retry/uncertain-delivery behavior is visible without exposing secrets.
5. Publish the Lovable application only after approval. Database migration `0025` is already applied; do not reapply it manually. Publishing updates the Lovable-hosted admin/Meta API and scheduled worker code.
6. On Oracle, keep `VITE_CRM_ADMIN_API_URL=https://lead-lantern-workspaces.lovable.app`, rebuild and redeploy the frontend. Keep only browser-safe publishable backend settings there; never add the privileged service key or Meta App Secret to Oracle or browser environment variables.
7. Keep the Meta OAuth and webhook callbacks on the Lovable URL above. After Oracle deployment, smoke-test Google login, workspace creation, invitations, Meta OAuth return to `https://crm.bedifly.com`, tenant isolation and analytics before explicitly enabling CAPI for an individual approved workspace.

## Phase 6 changed files

- `drizzle/migrations/0025_tighten_meta_conversion_table_grants.sql` — new security migration.
- `drizzle/migrations/meta/_journal.json` and `drizzle/migrations/meta/0025_snapshot.json` — generated migration metadata.
- `src/test/sql/meta-security-grants.sql` — new read-only privilege audit.
- `roadmap.md` — audit completion and remaining release blockers.
- `.lovable/phase6-results.md` — this report.

No Phase 1–5 application logic was rebuilt or replaced in Phase 6. No application publication, Oracle deployment, real conversion send or automatic production enablement occurred; the privilege-only database migration was applied to the existing backend.
