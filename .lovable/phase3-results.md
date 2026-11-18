# Phase 3 implementation and verification

## Changed files
- `src/lib/meta-capi-sender.server.ts`: normalization/hashing, original timestamp and stable event ID, validated Purchase value/currency, single-event dispatch, strict response acceptance, safe failure codes.
- `src/lib/meta-capi-store.server.ts`: workspace-scoped credentials/matching reads, Dataset access check, original and latest consent gates, final withdrawal/GPC recheck, safe receipt persistence.
- `src/lib/meta-admin.server.ts`: authorized `send-conversion` and `review-dataset-eligibility` actions, changed-credential test/review reset, exact test receipt count.
- `src/lib/meta-api-rules.ts`: action authorization scope and safe eligibility fields.
- `src/components/meta-capi.tsx`: explicit administrator Dataset eligibility review.
- `src/test/meta-capi-sender.test.ts` and `src/test/meta-api-authorization.test.ts`: sender tests and per-action tenant authorization tests.
- `AGENTS.md`, `roadmap.md`: architecture and remaining acceptance blocker.
- Generated database types and migration metadata were refreshed by the migration tool.

## Database change
Applied `drizzle/migrations/0019_meta_capi_secure_dispatch.sql` to the existing Lovable database; no replacement database or data migration. Adds disabled-by-default Dataset eligibility review and safe Dataset/receipt fields to existing records. The server-only reservation function atomically transitions only pending events in the requested workspace; repeat or concurrent requests cannot claim an already-processing/sent event. Database read-back confirms eligibility columns and function privileges: authenticated callers cannot execute it, service-role callers can.

## Results
- Full automated suite: **138 tests, 12 files passed**.
- Latest preview build: **build OK**.
- Signed-in unauthorized workspace dispatch: **HTTP 403**, no event sent.
- Live database: **0 CAPI configurations, 0 production-enabled configurations, 0 conversion events** at audit time.
- Actual Meta transmissions during this work: **0**; actual Meta accepted events: **not verified**. Mocked transport tests are not Meta receipt evidence.
- Authorized admin UI flow and real test-Dataset transmission remain unverified. The signed-in preview remained at workspace-access checking; the server endpoint independently verified permission rejection.

## Scope and next step
No publication, Oracle deployment, conversion schedule, automatic retry, or production enablement performed. Phase 4 worker/leases/retry controls remain deferred. This phase exposes a secure explicit single-event sender for the later worker; it does not automatically drain the outbox. Supply an authorized test Dataset, encrypted CAPI token and Meta Test Event Code through the existing workspace form to verify receipt before approving the next phase.

Retain consent evidence, check Events Manager Dataset restrictions, accept Meta Business Tools Terms, disclose Meta sharing and provide consent withdrawal through the CRM consent interface. Hashing does not make restricted sensitive data eligible.