import { describe, expect, it } from "vitest";
import { invitationRedirect, isAllowedCrmOrigin } from "@/lib/crm-admin-rules";

describe("admin endpoint origins", () => {
  it("allows the Oracle production site", () => expect(isAllowedCrmOrigin("https://crm.bedifly.com")).toBe(true));
  it("rejects lookalike and insecure origins", () => {
    expect(isAllowedCrmOrigin("https://crm.bedifly.com.evil.com")).toBe(false);
    expect(isAllowedCrmOrigin("http://crm.bedifly.com")).toBe(false);
    expect(isAllowedCrmOrigin("https://evil.com")).toBe(false);
  });
  it("sends invitations from crm.bedifly.com back to crm.bedifly.com", () => expect(invitationRedirect("https://crm.bedifly.com")).toBe("https://crm.bedifly.com"));
  it("falls back to crm.bedifly.com for unknown origins", () => expect(invitationRedirect("https://evil.com")).toBe("https://crm.bedifly.com"));
});
