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

- Client-owned Meta OAuth, Page/ad account/Instagram/form/dataset discovery, asset selection and scheduled lead processing are implemented but await Meta App configuration and live verification. Business Portfolio discovery, manual historical sync, campaign metadata enrichment, detailed Meta reporting and conversion sending remain unfinished.
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
- Meta connections use AES-256-GCM encrypted tokens with no browser grants. OAuth state is single-use, expires after ten minutes and is bound to the authenticated user and workspace. The popup callback returns only the authorization code; the authenticated opener exchanges and stores it.
- The webhook endpoint is `/api/public/meta/webhook`, not `/api/webhooks/meta`: public callbacks require the public prefix on this hosting platform.
- GET verifies the Meta challenge; POST verifies the raw-body SHA-256 signature, validates bounded payloads and stores unique leadgen notifications. The scheduled processor claims jobs with leases, retrieves selected-form leads, and atomically saves leads, raw responses, assignments and notifications. Automatic sync defaults off; suspended clients and unselected forms are skipped. Retries use bounded exponential backoff and a fifteen-minute delay for rate limits.
- Leads now retain Meta lead, Page, form, ad account, campaign, ad set and ad identifiers, plus optional fbc/fbp. Raw responses have separate protected storage.
- Conversion records support QualifiedLead/Purchase, stable deduplication references, original occurrence times, actual purchase value/currency and tenant-scoped consent references. No event is generated or transmitted yet.

### Pending Meta setup

The app needs `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, `META_REDIRECT_URI` and `META_WEBHOOK_VERIFY_TOKEN` before live synchronization can be enabled. The app-only `META_TOKEN_ENCRYPTION_KEY` has been securely generated. Store credentials through Lovable, never in source files. Set the Graph version to one verified as supported for your Developer App; no version is hardcoded.

Each client must authorize their own Meta assets; a workspace-owner connector is not a substitute. No matching Meta App User Connector is available in the inspected workspace catalogue, so custom client OAuth will use the Developer App requested in the brief.

After publishing, configure the exact same-origin HTTPS `/api/public/meta/callback` callback and `/api/public/meta/webhook` address in your Meta Developer App. Subscribe the App to Page leadgen events. Selecting each Page in CRM separately subscribes that Page. Select its forms and enable automatic sync. The verification token must be identical in Meta and the app's secure form.

Requested permissions: `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads` (form retrieval), `pages_manage_metadata` (Page webhook subscription), and `ads_read`. Business Portfolio discovery is pending; `business_management` and `ads_management` are not requested. Confirm current permissions and Advanced Access/App Review requirements against your Developer App before live activation.

For conversion reporting, retain customer consent evidence, verify Events Manager dataset restrictions, accept Meta Business Tools Terms, disclose Meta sharing, and provide a customer withdrawal/contact route. Do not send sensitive or ineligible data. No Pixel is installed on the private CRM.

### Verification limits

31 automated tests pass, including webhook signatures, notification deduplication, encrypted credentials, lead mapping, retry delays, default-disabled sync, assignment validation and conversion-permission gates. These are fixtures, not proof of real Facebook connectivity. A signed-in check reached the invitation-needed screen because the requesting account has no workspace; the integration controls and real lead imports remain unverified. Invalid callbacks return 400 and an unconfigured webhook returns 503. Live OAuth, asset discovery, lead import, notification delivery, retry processing, tenant isolation and Meta conversion receipt remain unverified.

The managed `bedifly-meta-lead-sync` schedule calls `/api/public/meta/process` every minute. It uses managed cron authentication, returns no lead details, and does not claim jobs while Meta configuration is missing. The published app must expose this endpoint before scheduled processing can run. Complete the Meta App setup before calling this a live integration.