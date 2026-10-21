"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { type CatalogueModel, type ParsedStock, formatKes, parseStockCsv } from "@cm/shared";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { importStock, type ImportResult } from "../../actions";

const km = new Intl.NumberFormat("en-KE");

export function StockUpload({ dealerId, catalogue }: { dealerId: string; catalogue: CatalogueModel[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedStock | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const [dragging, setDragging] = useState(false);

  const ready = useMemo(() => parsed?.rows.filter((r) => r.value) ?? [], [parsed]);
  const problems = useMemo(() => parsed?.rows.filter((r) => !r.value) ?? [], [parsed]);

  async function read(file: File | undefined) {
    setResults(null);
    setImportError(null);
    setFileError(null);
    setParsed(null);
    if (!file) return;
    setFileName(file.name);
    if (/\.(xlsx|xls|numbers|ods)$/i.test(file.name)) {
      setFileError("That's a spreadsheet file. Save it as CSV first: in Excel, File → Save As → CSV UTF-8. In Google Sheets, File → Download → CSV.");
      return;
    }
    if (file.size > 2_000_000) {
      setFileError("That file is over 2 MB. A stock list of 200 cars is usually under 100 KB: check it's the right file.");
      return;
    }
    const text = await file.text();
    setParsed(parseStockCsv(text, catalogue));
  }

  function runImport() {
    const rows = ready.map((r) => r.value!);
    startImport(async () => {
      const outcome = await importStock(dealerId, rows);
      if (outcome.error) setImportError(outcome.error);
      else setResults(outcome.results ?? []);
    });
  }

  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    return (
      <div className="flex max-w-3xl flex-col gap-5">
        <Alert tone={ok.length ? "success" : "error"}>
          {ok.length
            ? `${ok.length} ${ok.length === 1 ? "car" : "cars"} added as drafts, each linked to its Vehicle Passport.`
            : "No cars were added."}
          {failed.length ? ` ${failed.length} couldn't be added (below).` : ""}
        </Alert>
        {failed.length ? (
          <ul className="divide-y divide-mist rounded-[var(--radius-control)] border border-danger/30 bg-surface">
            {failed.map((r) => (
              <li key={r.row} className="px-4 py-3 text-sm">
                <span className="font-semibold">Row {r.row}:</span> {r.error}
              </li>
            ))}
          </ul>
        ) : null}
        {ok.length ? (
          <div className="rounded-[var(--radius-control)] border border-mist bg-surface p-4">
            <h2 className="text-lg font-bold">Next: photos</h2>
            <p className="mt-1 text-ink-soft">
              Each car needs at least 3 photos and a photo of the dashboard showing the mileage. Name the files with the
              chassis number (for example <code className="font-semibold">NZE161-7012345_1.jpg</code> and{" "}
              <code className="font-semibold">NZE161-7012345_dash.jpg</code>) and add them all at once.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <ButtonLink href={`/dealer/${dealerId}/photos`}>Add photos</ButtonLink>
              <ButtonLink href={`/dealer/${dealerId}/stock?status=draft`} variant="secondary">
                See the drafts
              </ButtonLink>
            </div>
          </div>
        ) : null}
        <button type="button" className={buttonClass("quiet", "md", "self-start")} onClick={() => read(undefined).then(() => setFileName(null))}>
          Upload another file
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-3xl">
        <h2 className="text-xl font-bold">Upload your stock from a spreadsheet</h2>
        <p className="mt-1 text-ink-soft">
          One car per row, up to 200 at a time. We check every row before anything is saved, and add the cars as
          drafts so you can add photos before they go on sale.
        </p>
        <p className="mt-2 text-sm text-muted">
          Columns we need: make, model, year, chassis_number, mileage_km, price_kes, condition, fuel, transmission.
          Optional: body_type, registration_number, negotiable, drivetrain, engine_cc, colour, county, town, features,
          description.{" "}
          <a href="/dealer/stock-template.csv" download className="font-semibold text-forest underline-offset-4 hover:underline">
            Download the template
          </a>
        </p>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void read(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          "flex max-w-3xl cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-control)] border-2 border-dashed px-6 py-10 text-center",
          dragging ? "border-forest bg-success-soft" : "border-mist bg-surface hover:border-ink/30",
        )}
      >
        <FileSpreadsheet aria-hidden className="size-10 text-forest" />
        <span className="text-lg font-semibold">{fileName ?? "Choose a CSV file"}</span>
        <span className="text-sm text-muted">or drop it here</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Stock spreadsheet (CSV)"
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {fileError ? <Alert tone="error" className="max-w-3xl">{fileError}</Alert> : null}
      {parsed?.fileErrors.length ? (
        <Alert tone="error" className="max-w-3xl">
          {parsed.fileErrors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </Alert>
      ) : null}

      {parsed && !parsed.fileErrors.length ? (
        <section aria-labelledby="preview-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="preview-heading" className="text-xl font-bold">
              {ready.length} of {parsed.rows.length} {parsed.rows.length === 1 ? "car" : "cars"} ready
              {problems.length ? <span className="text-danger"> · {problems.length} to fix</span> : null}
            </h2>
            <Button type="button" size="lg" disabled={!ready.length} pending={importing} onClick={runImport}>
              Add {ready.length} {ready.length === 1 ? "car" : "cars"} as drafts
            </Button>
          </div>
          {problems.length ? (
            <p className="text-sm text-ink-soft">
              Rows with problems are skipped. Fix them in your spreadsheet and upload them again later; the good rows
              can go in now.
            </p>
          ) : null}
          {parsed.ignoredColumns.length ? (
            <p className="text-sm text-muted">Columns we ignored: {parsed.ignoredColumns.join(", ")}.</p>
          ) : null}
          {importError ? <Alert tone="error">{importError}</Alert> : null}

          <ol className="divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface" aria-label="Rows in the file">
            {parsed.rows.map((r) => (
              <li key={r.row} className="flex gap-3 px-4 py-3" data-row={r.row}>
                {r.value ? (
                  <CheckCircle2 aria-label="Ready" className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <XCircle aria-label="Needs fixing" className="mt-0.5 size-5 shrink-0 text-danger" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <span className="mr-2 text-sm font-normal text-muted">Row {r.row}</span>
                    {r.title || "Untitled"}
                  </p>
                  {r.value ? (
                    <p className="text-sm text-ink-soft">
                      {r.value.chassis} · {km.format(r.value.mileage_km)} km · {formatKes(r.value.price_kes)}
                    </p>
                  ) : null}
                  {r.errors.map((e) => (
                    <p key={e} className="text-sm font-medium text-danger">
                      {e}
                    </p>
                  ))}
                  {r.warnings.map((w) => (
                    <p key={w} className="flex gap-1.5 text-sm text-ink-soft">
                      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-plate" />
                      {w}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="max-w-3xl text-sm text-muted">
        Prefer to add one at a time?{" "}
        <Link href={`/sell/new?dealer=${dealerId}`} className="font-semibold text-forest underline-offset-4 hover:underline">
          Add a single car
        </Link>
        .
      </p>
    </div>
  );
}
