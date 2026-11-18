# Release readiness (after Phase 6 blockers pass)

Verdict: NOT READY. Remaining blockers are listed below.

## 1. Dependencies
- Patched via upgrades/overrides: zod 4.6.7, seroval 1.8.1, js-yaml 4.3.2, source-map-js 1.2.2, brace-expansion 1.1.22, uuid 11.1.1 (exceljs transitive).
- Scan: 20 findings -> 2 (picomatch ReDoS, high, through TanStack build tooling). No patched picomatch is published (latest is 4.0.7, the fix requires >4.0.7). Only reachable at build time with developer-controlled glob patterns. OPEN: waiting on a fix upstream.
- One zod 4 API change was fixed (z.record now takes a key type). 168/168 tests pass, typecheck is clean.

## 2. Deep security scan (complete)
- 0 critical, 0 high. 3 warnings, all fixed in database change 0026:
  - Lead score could be set by the client: the score is now always recalculated on every lead change.
  - Former members could edit or delete their own notes: active membership is now required.
- A follow-up deep scan has not been run yet to confirm.

## 3. Database acceptance
- BLOCKED: the sandbox SQL role is read-only by platform design. It cannot create rollback fixtures, and the agent may not raise its privileges. No security was weakened. The fixture scripts in src/test/sql must run under a migration-capable role (for example in a draft backend).

## 4. Worker
- Schedule: one run per minute against /api/public/meta/process.
- Last 6h before fix: 334 successful (HTTP 200) runs. 26 rejected (HTTP 400) runs between 11:46 and 12:13 UTC.
- Cause: the Phase 4 schedule body {"kind":"all"} was sent to the published app, which still runs the pre-Phase-4 code and accepts only "lead_sync".
- Fix: the schedule body is back to {"kind":"lead_sync"}, which both the old and new code accept. The first run after the fix (12:14 UTC) returned 200. The handler now logs only the length and type of a rejected body.
- After publishing, switch the body back to {"kind":"all"} so conversion delivery runs as well.
- Expired leases and retries: no conversion events exist, so this is unverified live. The logic is covered by the Phase 4 unit tests and the earlier rollback checks.

## 5. Hardening
- Retention policy (documented, not yet automated):
  - Conversion delivery attempts and receipts: 13 months.
  - Conversion events: 25 months, or immediate when a lead is deleted or an erasure request is made.
  - Consent evidence: keep for the life of the lead plus 6 years (legal proof).
  - Webhook inbox payloads: 90 days.
  - Audit logs: append-only and never deleted.
  - Deletion must run as a scheduled server job that writes an audit_logs row with counts only, never personal data.
- MFA for Super Admin: supported by the auth provider (TOTP), but NOT enforced. Enforcing it needs an enrolment screen plus a check that blocks platform-admin actions below the required assurance level. It was deliberately not enabled to avoid locking out the only admin. OPEN. Google OAuth is unaffected.

## Still open
- picomatch upstream fix
- SQL fixture acceptance under a privileged role
- MFA enforcement
- retention job
- live Meta acceptance (two test Datasets, QualifiedLead/Purchase receipts)
- publish followed by restoring the "all" schedule body
