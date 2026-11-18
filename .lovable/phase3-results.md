# Phase 3 implementation and verification

## Changed files
- `src/lib/meta-capi-sender.server.ts`: normalization/hashing, original timestamp and stable event ID, validated Purchase value/currency, single-event dispatch, strict response acceptance, safe failure codes, and optional Meta Test Event Code dispatch using the same outbox event.
- `src/lib/meta-capi-store.server.ts`: workspace-scoped credentials/matching reads, Dataset access check, original and latest consent gates, final withdrawal/GPC recheck, safe receipt persistence, and separate test versus production reservation/preflight rules.
- `src/lib/meta-admin.server.ts`: authorized `send-conversion`, `send-conversion-test` and `review-dataset-eligibility` actions, changed-credential test/review reset, exact test receipt count, safe event receipt fields, and production-only client delivery counts.
- `src/lib/meta-api-rules.ts`: action authorization scope and safe eligibility/test/receipt fields.
- `src/components/meta-capi.tsx`: explicit administrator Dataset eligibility review.
- `src/components/meta-integration.tsx`: authorized Send test event button for pending QualifiedLead/Purchase outbox rows, plus Dataset, original-time, test-mode and provider-receipt display.
- `src/test/meta-capi-sender.test.ts` and `src/test/meta-api-authorization.test.ts`: sender, test-mode, and per-action tenant authorization tests.
- `AGENTS.md`, `roadmap.md`: architecture and remaining acceptance blocker.
- Generated database types and migration metadata were refreshed by the migration tool.

## Database changes
- Applied `drizzle/migrations/0019_meta_capi_secure_dispatch.sql` to the existing Lovable database; no replacement database or data migration. Adds disabled-by-default Dataset eligibility review and safe Dataset/receipt fields to existing records. The server-only production reservation function atomically transitions only pending events in the requested workspace; repeat or concurrent requests cannot claim an already-processing/sent event.
- Applied `drizzle/migrations/0020_meta_capi_test_event_dispatch.sql`. Adds a test-event marker to the existing outbox and a server-only test reservation function. Test dispatch requires a pending event, active workspace, reviewed eligible Dataset, saved token, successful configuration test event, Test Event Code, and current consent; it does not require or enable production CAPI. Production reservation rejects test-marked rows and still requires explicit production activation.
- Database read-back confirms anonymous and authenticated callers cannot execute either reservation function; service-role callers can.

## Results
- Full automated suite: **142 tests, 12 files passed**.
- TypeScript check: **passed**. Latest preview build: **build OK**.
- Signed-in master administrator verified the all-client Conversions monitor and workspace Dataset form; overview, client-status and CAPI-configuration requests returned **HTTP 200**, with no browser page errors.
- Signed-in unauthorized workspace dispatch was previously verified as **HTTP 403**, no event sent. The current authorization suite covers every action, including `send-conversion-test`, with **50 authorization tests**.
- Live database at this verification: **0 CAPI configurations, 0 production-enabled configurations, 0 conversion events, 0 consent records**.
- Automated tests verify stable outbox UUID event IDs, original Unix-second timestamps, workspace Dataset matching, SHA-256 normalization of email/phone, Purchase value/currency validation, consent/withdrawal/GPC blocking, final pre-send consent rechecks, and prevention of duplicate dispatch.
- Actual Meta transmissions during this work: **0**; actual Meta accepted QualifiedLead/Purchase events: **not verified**. Mocked transport tests are not Meta receipt evidence.
- Credentialed save, real test-Dataset transmission and Events Manager receipt remain unverified because no authorized test Dataset/token/Test Event Code is configured.

## Scope and next step
No publication, Oracle deployment, conversion schedule, automatic retry, production enablement, or Phase 4 implementation was performed. Phase 4 worker/leases/retry controls remain deferred until live Meta acceptance. The current implementation exposes secure explicit single-event production and test dispatch; it does not automatically drain the outbox.

Next, configure an authorized non-production test Dataset, encrypted CAPI token and Meta Test Event Code through the existing test workspace form. Then create two test-owned leads with explicit advertising and matching-data consent, generate one QualifiedLead and one Purchase outbox event, and use each row's Send test event button. Confirm both event IDs in Meta Events Manager → Test events and compare the CRM's recorded Dataset, original timestamp and exact `events_received: 1` receipt.

Retain consent evidence, check Events Manager Dataset restrictions, accept Meta Business Tools Terms, disclose Meta sharing and provide consent withdrawal through the CRM consent interface. Hashing does not make restricted sensitive data eligible.
