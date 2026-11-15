# Bedifly CRM

Bedifly CRM provides sign-in, separated client workspaces, lead and pipeline management, team invitations, follow-ups, activity history, and CSV/Excel reporting.

## Application

- Preview: https://id-preview--954a6ab8-768c-4618-9405-cdae5a76e912.lovable.app
- Published URL: not published yet.

## Access and initial administrator

- The first platform administrator is limited to `bediflyofficial@gmail.com` after that address is confirmed through the configured sign-in provider.
- The account tested in the preview, `info@bedifly.com`, is not assigned to a workspace. It correctly receives an invitation-needed screen rather than sample CRM data.
- A Bedifly administrator must confirm the designated company email and use it to sign in before creating client workspaces.
- Client users receive role-scoped access to active workspaces. Database row policies enforce isolation, and suspended workspaces are unavailable to client users.
- Client and team invitations use the configured email invitation service. The app's login and password reset options are also available.

## Phase 1 features

- Bedifly-branded sign-in, email confirmation flow, and password recovery.
- Platform and client dashboards with live database counts and charts.
- Client workspace creation, editing, and activation/suspension.
- Lead list and Kanban views, lead detail, role-aware updates, notes, activity, and scheduled follow-ups.
- Lead assignment, CSV and Excel import with duplicate checks, and workspace-scoped CSV and Excel export.
- Manual lead form and source-reference fields, including imported lead dates and custom date filtering.
- Per-workspace editable score rules with automatic rescoring after rule changes.
- Team invitations, activation state, and employee lead/follow-up metrics.
- Workspace statuses, reports, and responsive navigation.

## Data schema and configuration

Roles are stored separately from organizations and memberships. Tenant-owned records include organizations, organization members, leads, lead statuses, notes, activity entries, follow-ups, notifications, and audit logs. Tenant data uses organization IDs, and database row policies scope client access to active assigned workspaces. Lead records include contact details, source and campaign metadata, lead-created date, pipeline status, quality, score, assignee, follow-up date, and value.

Lovable Cloud manages the app's authentication and database connection settings. No private configuration values should be added to the source repository; use the project's Cloud settings for authentication-provider setup. The first platform administrator must use the confirmed `bediflyofficial@gmail.com` account.

## Not included or not yet verified

- Phase 2/3 foundations are present, but Meta OAuth, asset discovery, lead processing, dataset discovery and conversion sending are not implemented or active yet.
- The automated score derives call-response and interest points from pipeline status; separate call-response and interest events are not recorded.
- End-to-end multi-client acceptance tests (including two live client accounts, employee invitations, imports into a live tenant, and cross-tenant attempts) require the designated administrator and invited test accounts. Those accounts were not available in this preview session. A 100-row spreadsheet round-trip test passes locally, but it does not verify database import permissions.
- Rate limiting and adjustable email-confirmation settings were not independently verified.

## Development checks

```sh
bunx vitest run src/test/app-routing.test.tsx src/test/crm-access.test.ts src/test/crm-spreadsheets.test.ts
oj typecheck -b --noEmit
```

The CRM access and spreadsheet utility tests pass. Full multi-client acceptance checks require the confirmed platform administrator and invited client accounts; those accounts were unavailable for this preview verification.

The app is built with TanStack Start, React, TypeScript, Tailwind CSS, and Recharts. Backend access uses Lovable Cloud, generated authenticated browser access, database row policies, and authenticated server functions for invitations.

## Phase 2 and 3 foundations

- The Meta Ads section shows real stored records, honest pending configuration, client synchronization preferences and conversion status.
- Meta connections have encrypted-token storage columns inaccessible to browser clients. Encryption and OAuth exchange still need implementation.
- The webhook endpoint is `/api/public/meta/webhook`, not `/api/webhooks/meta`: public callbacks require the public prefix on this hosting platform.
- GET verifies the Meta challenge; POST verifies the raw-body SHA-256 signature, validates bounded payloads and stores unique leadgen notifications. It does not retrieve leads yet, and there is no active worker or scheduled processor.
- Leads now retain Meta lead, Page, form, ad account, campaign, ad set and ad identifiers, plus optional fbc/fbp. Raw responses have separate protected storage.
- Conversion records support QualifiedLead/Purchase, stable deduplication references, original occurrence times, actual purchase value/currency and tenant-scoped consent references. No event is generated or transmitted yet.

### Pending Meta setup

The app needs `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, `META_REDIRECT_URI`, `META_WEBHOOK_VERIFY_TOKEN` and an app-issued `META_TOKEN_ENCRYPTION_KEY` before live authorization can be enabled. Store credentials securely through Lovable, never in source files. No values have been requested or stored yet. Set the Graph version to one verified as supported for your Developer App; no version is hardcoded.

Each client must authorize their own Meta assets; a workspace-owner connector is not a substitute. No matching Meta App User Connector is available in the inspected workspace catalogue, so custom client OAuth will use the Developer App requested in the brief.

After publishing, configure the exact HTTPS callback and `/api/public/meta/webhook` address in your Meta Developer App, subscribe to Page leadgen events and separately subscribe each selected Page. The callback route is not yet implemented, so do not configure it as working yet. The verification token must be identical in Meta and the app's secure form.

Expected permissions: `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, and `ads_read`; Page webhook subscription may require `pages_manage_metadata`. Request `business_management` only if the confirmed business discovery feature needs it. Do not request `ads_management` for read-only lead integration. Confirm current permissions and Advanced Access/App Review requirements against your Developer App before authorization implementation.

For conversion reporting, retain customer consent evidence, verify Events Manager dataset restrictions, accept Meta Business Tools Terms, disclose Meta sharing, and provide a customer withdrawal/contact route. Do not send sensitive or ineligible data. No Pixel is installed on the private CRM.

### Verification limits

Tests cover webhook signatures, notification deduplication, selected assignment validation and conversion-permission gates. These are fixtures, not proof of real Facebook connectivity. Live OAuth, asset discovery, lead import, notification delivery, retry processing, tenant isolation and Meta conversion receipt remain unverified.