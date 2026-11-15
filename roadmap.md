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
- [ ] Implement client-owned OAuth and asset discovery, with secure workspace-owned connections and asset selection.
- [ ] Implement lead retrieval, assignment and retry processing; live activation requires Meta Developer App configuration.
- [ ] Verify real Meta connection, selected-form synchronization and two-client isolation.

## Phase 3 — Conversion reporting
- [x] Add dataset settings, consent evidence and a deduplicated conversion outbox for QualifiedLead and Purchase.
- [ ] Implement consent-checked event transmission and dataset discovery; requires authorized Meta assets and configuration.
- [ ] Verify Meta receipt, event deduplication and withdrawal behavior with test events.
