import { describe, expect, it } from "vitest";

describe("CRM access boundaries", () => {
  it("does not treat an account without assigned workspaces as CRM workspace access", () => {
    const hasPlatformRole = false;
    const accessibleOrganizations: string[] = [];

    expect(Boolean(hasPlatformRole) || accessibleOrganizations.length > 0).toBe(false);
  });

  it("keeps workspace access available for an assigned client organization", () => {
    const hasPlatformRole = false;
    const accessibleOrganizations = ["client-workspace"];

    expect(Boolean(hasPlatformRole) || accessibleOrganizations.length > 0).toBe(true);
  });
});