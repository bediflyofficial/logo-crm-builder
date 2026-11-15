# Bedifly CRM Phase 1

- [x] Set up tenant-isolated CRM tables, roles, and row-level access rules.
- [x] Build branded sign-in and password recovery with protected workspace access.
- [x] Build live dashboards, client management, lead workflows, team, and follow-ups.
- [x] Add CSV/Excel import and export, lead-source fields, and custom date filters.
- [x] Verify type safety and focused project tests; document setup boundaries.
- [x] Add configurable lead scoring and automatic score recalculation when rules change.
- [ ] Run live multi-client acceptance checks after the verified platform administrator and test client accounts are available.

## Phase 2 — Meta lead synchronization
- [x] Add tenant-isolated Meta connections, selected assets, sync settings and durable webhook inbox.
- [x] Add Meta integration setup and health screens without simulated connection states.
- [x] Implement verified webhook reception and deduplicated job storage.
- [x] Implement client-owned OAuth, encrypted Page credentials, Page/ad-account/Instagram/form/dataset discovery and asset selection.
- [x] Implement selected-form lead retrieval, atomic workspace assignment, notifications and retry processing.
- [ ] Configure Meta Developer App settings and verify the scheduled processor with real Meta leads; blocked on credentials and publishing.
- [ ] Finish Business Portfolio discovery, manual historical synchronization, campaign attribution enrichment and detailed Meta lead reports.
- [ ] Verify real Meta connection, selected-form synchronization and two-client isolation.

## Phase 3 — Conversion reporting
- [x] Add dataset settings, consent evidence and a deduplicated conversion outbox for QualifiedLead and Purchase.
- [x] Implement dataset discovery through accessible ad accounts.
- [x] Add per-workspace Dataset/CAPI configuration with real connection tests, test events, enable/disconnect and Super Admin delivery monitoring.
- [ ] Implement consent-checked event transmission; requires verified dataset eligibility, customer consent workflow and Meta configuration.
- [ ] Verify Meta receipt, event deduplication and withdrawal behavior with test events.
- [ ] Confirm Meta leadgen webhook is live at the published address (needs META_WEBHOOK_VERIFY_TOKEN)
