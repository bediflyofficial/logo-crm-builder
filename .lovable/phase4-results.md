# Phase 4 implementation and verification

## Scope
Implemented queue reliability only, using the existing `meta_conversion_events` outbox. Phase 5 was not started. Nothing was published or deployed to Oracle. No real Meta event was transmitted.

## Implementation
- A managed scheduled request now runs the existing lead processor and one conversion event per minute under the same `kind: all` job. This keeps the existing 1,440 checks/day rather than adding another polling job.
- The conversion worker uses server-only, atomic database claims with 90-second lease tokens and `FOR UPDATE SKIP LOCKED`; completion must match the current lease. The existing stable outbox UUID remains the Meta `event_id`.
- Confirmed temporary failures retry automatically with exponential backoff: 60 seconds initially, capped at 1 hour. Rate limits start at 5 minutes and cap at 6 hours. Automatic delivery stops at 8 attempts.
- Permanent provider errors stop without automatic retry. Timeouts, network uncertainty, unconfirmed responses, receipt-persistence failures and expired leases are treated as uncertain and require administrator review rather than blind replay.
- Workspace administrators can explicitly queue one manual retry for a failed production event, including after the automatic limit. Each retry rechecks active workspace status, Dataset/eligibility/credentials, original and latest consent, withdrawal and Global Privacy Control immediately before transmission.
- Test-marked events are excluded from production claims. Test and production reservations use separate mode checks.
- Invalid Meta CAPI tokens disable and mark only the affected workspace configuration as `connection_error`.
- Delivery history stores only event/workspace IDs, attempt number, Dataset ID, safe status/error codes, timestamps and receipt count. It contains no tokens, customer matching fields or provider response bodies.
- The Conversions screen shows attempts, next automatic retry, failure category, recent safe history and an authorized Manual retry button for failed production events. Uncertain retries require confirmation to check Meta Events Manager first.

## Database migrations
- `0021_meta_capi_worker_reliability.sql`: adds lease, attempt-time, failure-category and manual-retry fields to the existing outbox; creates the delivery-attempt history table with administrator-only read policies; adds atomic production/test reservations, batch claims, lease-guarded completion, invalid-token pause and manual retry functions. Browser roles cannot execute worker functions.
- `0022_fix_meta_capi_claim_aliases.sql`: corrects ambiguous aliases in the claim query found by the rollback test. No customer data changed.
- Generated database types and migration metadata were refreshed by the migration tool.

## Changed application files
- `src/lib/meta-capi-worker.server.ts`: persistent worker entry point, one leased event per scheduled invocation.
- `src/lib/meta-capi-sender.server.ts`: failure classification, bounded backoff, uncertain-result policy, leased-event dispatch and existing payload/consent protections.
- `src/lib/meta-capi-store.server.ts`: atomic claim/completion calls, active-workspace checks and existing credential/consent preflight.
- `src/routes/api/public/meta/process.ts`: authenticated scheduled `lead_sync`, `conversion_delivery` and combined `all` modes; independent failure handling for the two processors.
- `src/lib/meta-admin.server.ts`: safe attempt-history fields and authorized `retry-conversion` action.
- `src/lib/meta-api-rules.ts`: retry-action authorization and safe overview/history types.
- `src/components/meta-integration.tsx`: retry controls, delivery status and safe recent attempt history.
- `src/test/meta-capi-worker.test.ts`: retry, failure, worker, consent and test-isolation tests.
- `src/test/meta-capi-sender.test.ts`: leased-event fixtures and existing duplicate/concurrency coverage.
- `src/test/meta-api-authorization.test.ts`: all 26 Meta actions, including manual retry, with cross-workspace denial.
- `src/test/sql/meta-capi-worker.sql`: rollback-only two-workspace database acceptance checks.
- `AGENTS.md`, `roadmap.md`, `.lovable/phase4-results.md`: architecture, scope and verification record.

## Verification results
- Full automated suite: **158 tests, 13 files passed**.
- Focused Phase 4 suite: **93 tests passed** across sender, worker and API authorization.
- Rollback-only database test: **passed** after correcting the claim alias. It verified two workspaces/two Dataset IDs, duplicate-claim prevention, stable IDs, retry scheduling, invalid-token pause scoped to one workspace, manual retry beyond the automatic limit, expired-lease uncertainty, withdrawal blocking, test exclusion and history RLS.
- Database read-back: **0 rollback rows remaining, 0 production-enabled configurations, 0 conversion events, 0 delivery attempts**.
- Latest preview build/typecheck: **build OK**.
- Signed-in master administrator: all-client overview and client-status requests returned **HTTP 200**. Workspace overview and Dataset configuration returned **HTTP 200**; no browser page errors. Production remains off; the empty configuration form does not display an enabled toggle.
- Managed schedule read-back: `bedifly-meta-lead-sync`, active, every minute, `/api/public/meta/process`, body `{"kind":"all"}`.

## Remaining blockers and unverified items
- No authorized test Dataset, CAPI token or Test Event Code is configured. Real Meta acceptance, retries against real provider failures and two-production-Dataset delivery remain unverified.
- No failed production event exists in live data, so the Manual retry button was not clicked in the browser; its authorization and database behavior were tested automatically and through rollback SQL.
- The schedule is configured, but no real conversion was available to drain. Lead synchronization remains preserved by the combined job.
- No production publication or Oracle deployment was performed. Phase 5 analytics was not started.
