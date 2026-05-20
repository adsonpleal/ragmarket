// Minimal RFC 4180-ish CSV writer.
//
// - Fields containing comma, quote, CR, or LF are wrapped in double quotes.
// - Internal double quotes are escaped by doubling.
// - Rows are joined with CRLF (what Excel expects).
// - A leading BOM lets Excel detect UTF-8 (Portuguese accents survive).

import { saveTextFile } from "./invoke";

export type CsvRow = Record<string, string | number | null | undefined>;

function escapeField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: CsvRow[], columns: string[]): string {
  const header = columns.map(escapeField).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeField(row[c])).join(","))
    .join("\r\n");
  return "﻿" + header + "\r\n" + body + (body ? "\r\n" : "");
}

// WebView2 silently no-ops on the usual `<a download>` blob-URL trick, so
// we hand the bytes to a Rust command that pops the native save dialog
// and writes the file itself. Errors are logged here so callers stay a
// single line; the user's only failure mode in practice is hitting
// Cancel, which resolves without an error.
export async function downloadCsv(filename: string, csv: string): Promise<void> {
  try {
    await saveTextFile(filename, csv, [{ name: "CSV", extensions: ["csv"] }]);
  } catch (err) {
    console.error("[downloadCsv] save failed:", err);
  }
}
