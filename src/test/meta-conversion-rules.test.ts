import { describe, expect, it } from "vitest";
import { DEFAULT_META_CONVERSION_RULES, metaConversionRuleSchema } from "@/lib/meta-rules";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

describe("workspace conversion rules", () => {
  it("provides disabled QualifiedLead and Purchase defaults", () => {
    expect(DEFAULT_META_CONVERSION_RULES).toEqual([
      { triggerType: "status", triggerValue: "Qualified", eventName: "QualifiedLead", enabled: false },
      { triggerType: "status", triggerValue: "Converted", eventName: "Purchase", enabled: false },
    ]);
    expect(DEFAULT_META_CONVERSION_RULES.every((rule) => !rule.enabled)).toBe(true);
  });

  it("allows an administrator to map Qualified to QualifiedLead", () => {
    expect(metaConversionRuleSchema.safeParse({ organizationId: WORKSPACE, triggerType: "status", triggerValue: "Qualified", eventName: "QualifiedLead", enabled: true }).success).toBe(true);
  });

  it("allows Converted to map to Purchase without enabling it automatically", () => {
    const result = metaConversionRuleSchema.parse({ organizationId: WORKSPACE, triggerType: "status", triggerValue: "Converted", eventName: "Purchase", enabled: false });
    expect(result.eventName).toBe("Purchase");
    expect(result.enabled).toBe(false);
    expect(result.currency).toBeNull();
  });

  it("rejects enabling a rule with no Meta event", () => {
    expect(metaConversionRuleSchema.safeParse({ organizationId: WORKSPACE, triggerType: "status", triggerValue: "Qualified", eventName: null, enabled: true }).success).toBe(false);
  });

  it("requires a currency before enabling Purchase", () => {
    expect(metaConversionRuleSchema.safeParse({ organizationId: WORKSPACE, triggerType: "status", triggerValue: "Converted", eventName: "Purchase", enabled: true }).success).toBe(false);
    expect(metaConversionRuleSchema.safeParse({ organizationId: WORKSPACE, triggerType: "status", triggerValue: "Converted", eventName: "Purchase", enabled: true, currency: "INR" }).success).toBe(true);
  });

  it("rejects unknown quality trigger values", () => {
    expect(metaConversionRuleSchema.safeParse({ organizationId: WORKSPACE, triggerType: "quality", triggerValue: "Excellent", eventName: "QualifiedLead", enabled: true }).success).toBe(false);
  });

  it("accepts a workspace-specific quality mapping", () => {
    expect(metaConversionRuleSchema.safeParse({ organizationId: WORKSPACE, triggerType: "quality", triggerValue: "Hot", eventName: "QualifiedLead", enabled: false }).success).toBe(true);
  });
});
