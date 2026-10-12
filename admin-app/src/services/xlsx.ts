/**
 * Writes an Excel workbook (.xlsx) with one sheet.
 *
 * An .xlsx file is a zip of a few small XML files, so this builds those by
 * hand and zips them -- no spreadsheet library, which would add megabytes to
 * the app for the sake of four reports.
 *
 * What a report gets: a bold, coloured header row that stays in view while
 * scrolling, a filter button on every column, columns sized to their
 * contents, and numbers stored as numbers so Excel can total them. Text is
 * always stored as text, so a note that happens to start with "=" can never
 * run as a formula.
 */
import { strToU8, zipSync } from "fflate";

export interface SheetColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters are not allowed in XML at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** 0 -> A, 25 -> Z, 26 -> AA. */
function columnLetter(index: number): string {
  let out = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

function cell(ref: string, value: unknown, style: number): string {
  if (value === null || value === undefined || value === "") return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${value ? "Yes" : "No"}</t></is></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Style 0: ordinary cell. Style 1: the header -- bold white on the app's blue.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF007AFF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs></styleSheet>`;

/** Builds the workbook's bytes. `sheetName` is the tab's name inside Excel. */
export function toXlsx<T>(sheetName: string, rows: T[], columns: SheetColumn<T>[]): Uint8Array {
  const values = rows.map((row) => columns.map((column) => column.value(row)));
  const lastColumn = columnLetter(Math.max(columns.length - 1, 0));
  const lastRow = rows.length + 1;

  // Wide enough for the longest entry, within reason.
  const widths = columns.map((column, index) => {
    const longest = values.reduce((max, row) => Math.max(max, String(row[index] ?? "").length), column.header.length);
    return Math.min(Math.max(longest + 3, 9), 48);
  });

  const header = `<row r="1" ht="20" customHeight="1">${columns.map((column, index) => cell(`${columnLetter(index)}1`, column.header, 1)).join("")}</row>`;
  const body = values
    .map((row, r) => `<row r="${r + 2}">${row.map((value, c) => cell(`${columnLetter(c)}${r + 2}`, value, 0)).join("")}</row>`)
    .join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${header}${body}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;

  // Excel refuses a tab name over 31 characters or containing any of \ / ? * [ ] :
  const safeName = escapeXml(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(ROOT_RELS),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}
