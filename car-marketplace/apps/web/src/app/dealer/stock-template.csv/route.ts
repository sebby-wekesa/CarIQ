import { stockCsvTemplate } from "@cm/shared";

/** The spreadsheet layout for bulk uploads, with one example car. */
export function GET() {
  return new Response(`﻿${stockCsvTemplate()}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stock-template.csv"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
