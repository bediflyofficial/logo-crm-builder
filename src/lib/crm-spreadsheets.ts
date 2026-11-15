export function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase().replaceAll("_", " ").replaceAll(/\s+/g, " ");
}

export function normalizeLeadPhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char ?? "";
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value.trim()));
}

export function parseLeadDate(value: string): string | null {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("This Excel file has no worksheet.");

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(Array.from({ length: row.cellCount }, (_, index) => {
      const value = row.getCell(index + 1).value;
      if (value == null) return "";
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "object" && "text" in value) return String(value.text ?? "");
      if (typeof value === "object" && "result" in value) return String(value.result ?? "");
      return String(value);
    }));
  });
  return rows;
}

export async function createXlsx(rows: unknown[][]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.addRows(rows.map((row) => row.map((value) => {
    if (typeof value !== "string" || !/^[\s]*[=+@\-]/.test(value)) return value;
    return `'${value}`;
  })));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = (rows[0] ?? []).map((header, index) => ({
    header: String(header ?? ""),
    key: `column${index}`,
    width: Math.min(Math.max(String(header ?? "").length + 3, 14), 30),
  }));
  return workbook.xlsx.writeBuffer();
}