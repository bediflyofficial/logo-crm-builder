import { describe, expect, it, vi } from "vitest";
import {
  authorizeMetaAction,
  META_ACTIONS,
  META_ORG_ACTIONS,
  META_PLATFORM_ACTIONS,
  MetaApiAuthorizationError,
  type MetaAuthorizationCaller,
} from "@/lib/meta-api-rules";

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";

function caller({ platform = false, adminWorkspaces = [] as string[] } = {}): MetaAuthorizationCaller {
  return {
    supabase: {
      rpc: vi.fn(async (name: "is_org_admin" | "is_platform_admin", args?: { _organization_id: string }) => ({
        data: name === "is_platform_admin" ? platform : Boolean(args && adminWorkspaces.includes(args._organization_id)),
        error: null,
      })),
    },
  };
}

describe("Meta Lovable API authorization", () => {
  it("assigns every one of the 18 actions an explicit authorization scope", () => {
    expect(META_ACTIONS).toHaveLength(18);
    expect(new Set(META_ACTIONS).size).toBe(18);
    expect([...META_ORG_ACTIONS, ...META_PLATFORM_ACTIONS, "overview"].sort()).toEqual([...META_ACTIONS].sort());
  });

  it.each(META_ORG_ACTIONS)("denies %s to a user without workspace-admin rights", async (action) => {
    const request = authorizeMetaAction(caller(), action, WORKSPACE_A);
    await expect(request).rejects.toMatchObject({ status: 403, message: "Only an administrator of this workspace can do this." });
  });

  it.each(META_ORG_ACTIONS)("stops %s from crossing into another client workspace", async (action) => {
    const clientAdmin = caller({ adminWorkspaces: [WORKSPACE_A] });
    await expect(authorizeMetaAction(clientAdmin, action, WORKSPACE_A)).resolves.toBeUndefined();
    await expect(authorizeMetaAction(clientAdmin, action, WORKSPACE_B)).rejects.toBeInstanceOf(MetaApiAuthorizationError);
  });

  it("scopes overview and sync history to the requested workspace", async () => {
    const clientAdmin = caller({ adminWorkspaces: [WORKSPACE_A] });
    await expect(authorizeMetaAction(clientAdmin, "overview", WORKSPACE_A)).resolves.toBeUndefined();
    await expect(authorizeMetaAction(clientAdmin, "overview", WORKSPACE_B)).rejects.toMatchObject({ status: 403 });
  });

  it.each(META_PLATFORM_ACTIONS)("denies platform-only %s to a client administrator", async (action) => {
    const clientAdmin = caller({ adminWorkspaces: [WORKSPACE_A] });
    await expect(authorizeMetaAction(clientAdmin, action, WORKSPACE_A)).rejects.toMatchObject({ status: 403, message: "Only the Bedifly platform administrator can do this." });
  });

  it("allows the platform administrator to monitor all clients and open the master overview", async () => {
    const platformAdmin = caller({ platform: true });
    for (const action of META_PLATFORM_ACTIONS) await expect(authorizeMetaAction(platformAdmin, action, null)).resolves.toBeUndefined();
    await expect(authorizeMetaAction(platformAdmin, "overview", null)).resolves.toBeUndefined();
  });

  it("denies the all-client overview to a client administrator", async () => {
    const clientAdmin = caller({ adminWorkspaces: [WORKSPACE_A] });
    await expect(authorizeMetaAction(clientAdmin, "overview", null)).rejects.toMatchObject({ status: 403 });
  });

  it("fails closed when the database role check fails", async () => {
    const brokenCaller: MetaAuthorizationCaller = { supabase: { rpc: vi.fn(async () => ({ data: null, error: new Error("role lookup failed") })) } };
    await expect(authorizeMetaAction(brokenCaller, "capi-config", WORKSPACE_A)).rejects.toMatchObject({ status: 403 });
  });
});
