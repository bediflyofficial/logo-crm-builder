# Bedifly CRM — Phase 1

Bedifly CRM provides sign-in, separated client workspaces, lead and pipeline management, team invitations, follow-ups, activity history, and CSV reporting.

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
- Lead assignment, CSV import with duplicate checks, and workspace-scoped CSV export.
- Team invitations, activation state, and employee lead/follow-up metrics.
- Workspace statuses, reports, and responsive navigation.

## Not included or not yet verified

- Excel import/export, custom date ranges, configurable scoring, and native Meta integrations are not included in Phase 1.
- The automated lead score currently uses contact details and pipeline progress; call responses and expressed interest are not recorded as separate scoring events.
- End-to-end multi-client acceptance tests (including 100-row imports, two live client accounts, and cross-tenant attempts) require the designated administrator and invited test accounts. Those accounts were not available in this preview session.
- Rate limiting and adjustable email-confirmation settings were not independently verified.

## Development checks

```sh
bunx vitest run src/test/app-routing.test.tsx src/test/crm-access.test.ts
oj typecheck -b --noEmit
```

The app is built with TanStack Start, React, TypeScript, Tailwind CSS, and Recharts. Backend access uses Lovable Cloud, generated authenticated browser access, database row policies, and authenticated server functions for invitations.