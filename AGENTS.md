<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Keep Bedifly CRM tenant authorization in database-backed role tables and row-level policies, with browser data access scoped through the generated authenticated client, so client workspaces cannot cross-read records.
- Keep workspace-access eligibility in a shared pure predicate so the sign-in boundary and its tests enforce the same rule.
- Keep spreadsheet parsing and generation browser-only via on-demand imports so spreadsheet libraries do not enter server rendering.
- Keep lead score rules workspace-specific in the database and recalculate scores with database triggers so all clients use the same authoritative rules.
- Keep Meta credentials in server-only encrypted columns with no browser column grants; this prevents tenant admins from reading tokens.
- Receive Meta leadgen callbacks under /api/public/meta/webhook and persist a deduplicated inbox before acknowledging; external callbacks cannot depend on a browser session.
- Keep conversion sending disabled until dataset eligibility and event-time/current customer permission are verified; receiving a CRM lead is not consent to send conversions.
- Complete custom Meta OAuth in the authenticated opener using a single-use state bound to user and organization; callbacks never require or receive the app session.
- Store Page credentials separately from browser-readable assets, encrypted with authenticated encryption; safe asset metadata uses an explicit allowlist.
- Claim Meta lead jobs with database leases and save leads, round-robin assignment, raw responses and notifications in one database transaction to prevent duplicate or partial imports.
- Run every browser-facing Meta integration action only in `/api/public/meta/manage/$action` on Lovable hosting, verifying the bearer user and platform/org-admin role per request with the CRM CORS origin allowlist; Conversions API credentials stay in a no-browser-grant table and production enabling requires a Meta-accepted test event.
- Privileged CRM admin actions (workspace creation, invitations, role assignment) run only in `/api/public/admin/$action` on Lovable hosting, verifying the bearer user and platform/org-admin role per request with a CORS origin allowlist; externally hosted frontends (crm.bedifly.com) never hold the service-role key.
