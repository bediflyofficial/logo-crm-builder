import { describe, expect, it } from "vitest";
import { hasCrmWorkspaceAccess, resolveWorkspaceSelection } from "@/lib/crm-access";

describe("CRM access boundaries", () => {
  it("does not treat an account without assigned workspaces as CRM workspace access", () => {
    expect(hasCrmWorkspaceAccess(false, 0)).toBe(false);
  });

  it("keeps workspace access available for an assigned client organization", () => {
    expect(hasCrmWorkspaceAccess(false, 1)).toBe(true);
  });

  it("keeps platform administrators in the platform even before clients exist", () => {
    expect(hasCrmWorkspaceAccess(true, 0)).toBe(true);
  });

  it("shows all client workspaces by default on the platform dashboard", () => {
    expect(resolveWorkspaceSelection(true, undefined, "", ["client-a", "client-b"])).toBe("");
  });

  it("keeps client users within their first assigned workspace", () => {
    expect(resolveWorkspaceSelection(false, undefined, "", ["client-a", "client-b"])).toBe("client-a");
  });

});