# Bedifly CRM — Phase 1

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
- Team invitations, activation state, and employee lead/follow-up metrics.
- Workspace statuses, reports, and responsive navigation.

## Data schema and configuration

Roles are stored separately from organizations and memberships. Tenant-owned records include organizations, organization members, leads, lead statuses, notes, activity entries, follow-ups, notifications, and audit logs. Tenant data uses organization IDs, and database row policies scope client access to active assigned workspaces. Lead records include contact details, source and campaign metadata, lead-created date, pipeline status, quality, score, assignee, follow-up date, and value.

Lovable Cloud manages the app's authentication and database connection settings. No private configuration values should be added to the source repository; use the project's Cloud settings for authentication-provider setup. The first platform administrator must use the confirmed `bediflyofficial@gmail.com` account.

## Not included or not yet verified

- Configurable scoring and native Meta integrations are not included in Phase 1.
- The automated lead score currently uses contact details and pipeline progress; call responses and expressed interest are not recorded as separate scoring events.
- End-to-end multi-client acceptance tests (including two live client accounts, employee invitations, imports into a live tenant, and cross-tenant attempts) require the designated administrator and invited test accounts. Those accounts were not available in this preview session. A 100-row spreadsheet round-trip test passes locally, but it does not verify database import permissions.
- Rate limiting and adjustable email-confirmation settings were not independently verified.

## Development checks

```sh
bunx vitest run src/test/app-routing.test.tsx src/test/crm-access.test.ts
bunx vitest run src/test/crm-spreadsheets.test.ts
oj typecheck -b --noEmit
```

The CRM access and spreadsheet utility tests pass. Full multi-client acceptance checks require the confirmed platform administrator and invited client accounts; those accounts were unavailable for this preview verification.

The app is built with TanStack Start, React, TypeScript, Tailwind CSS, and Recharts. Backend access uses Lovable Cloud, generated authenticated browser access, database row policies, and authenticated server functions for invitations.