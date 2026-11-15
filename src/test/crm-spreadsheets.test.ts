import { describe, expect, it } from "vitest";
import { createXlsx, normalizeHeader, normalizeLeadPhone, parseCsv, parseLeadDate, parseXlsx } from "@/lib/crm-spreadsheets";

describe("CRM spreadsheet handling", () => {
  it("normalizes common CRM headers and parses quoted CSV values", () => {
    expect(normalizeHeader("\uFEFF Source_Reference_ID ")).toBe("source reference id");
    expect(normalizeLeadPhone("+1 (415) 555-0100")).toBe("14155550100");
    expect(parseCsv('Full Name,Email\r\n"Taylor, Morgan",taylor@example.com')).toEqual([
      ["Full Name", "Email"],
      ["Taylor, Morgan", "taylor@example.com"],
    ]);
  });

  it("accepts valid lead dates and skips invalid imported dates", () => {
    expect(parseLeadDate("2026-05-03")).toBe(new Date("2026-05-03").toISOString());
    expect(parseLeadDate("not-a-date")).toBeNull();
  });

  it("round-trips a 100-row lead spreadsheet with source metadata", async () => {
    const values: unknown[][] = [["Full Name", "Source", "Form Name", "Source Reference ID"]];
    for (let index = 1; index <= 100; index += 1) {
      values.push([`Lead ${index}`, "Web", "Contact form", `ref-${index}`]);
    }
    const buffer = await createXlsx(values);
    const rows = await parseXlsx(buffer);
    expect(rows).toHaveLength(101);
    expect(rows[100]).toEqual(["Lead 100", "Web", "Contact form", "ref-100"]);
  });
});