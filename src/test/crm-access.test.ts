import { describe, expect, it } from "vitest";
import { hasCrmWorkspaceAccess, isWithinDateFilter, resolveWorkspaceSelection } from "@/lib/crm-access";

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


  it("includes both endpoints of a custom date range and excludes dates outside it", () => {
    const now = new Date(2026, 4, 6, 12);
    expect(isWithinDateFilter("2026-05-03T00:00:00", "Custom range", "2026-05-03", "2026-05-05", now)).toBe(true);
    expect(isWithinDateFilter("2026-05-05T23:59:59.999", "Custom range", "2026-05-03", "2026-05-05", now)).toBe(true);
    expect(isWithinDateFilter("2026-05-06T00:00:00", "Custom range", "2026-05-03", "2026-05-05", now)).toBe(false);
  });

  it("returns no leads for a reversed custom range", () => {
    expect(isWithinDateFilter("2026-05-04T12:00:00", "Custom range", "2026-05-05", "2026-05-03", new Date(2026, 4, 6))).toBe(false);
  });

  it("keeps yesterday separate from today", () => {
    const now = new Date(2026, 4, 6, 12);
    expect(isWithinDateFilter("2026-05-05T12:00:00", "Yesterday", "", "", now)).toBe(true);
    expect(isWithinDateFilter("2026-05-06T12:00:00", "Yesterday", "", "", now)).toBe(false);
  });
});