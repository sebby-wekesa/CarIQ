"use client";

import { FileCheck2, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DOCUMENT_KINDS, type DocumentKind } from "@cm/shared";
import type { Database } from "@cm/db";
import { shrinkImage, uploadFile } from "@/lib/media/client-resize";
import { buttonClass } from "@/components/ui/button";
import { deleteDocument, documentLink } from "../actions";

type Document = {
  id: string;
  kind: Database["public"]["Enums"]["document_kind"];
  content_type: string;
  verification_level: Database["public"]["Enums"]["verification_level"];
  created_at: string;
};

const LEVEL_COPY: Record<Document["verification_level"], string> = {
  declared: "Declared",
  provided: "Provided — not yet checked",
  checked: "Checked by us",
  verified: "Verified",
};

export function PassportUploads({ listingId, documents }: { listingId: string; documents: Document[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {DOCUMENT_KINDS.map((config) => (
        <DocumentSlot
          key={config.kind}
          listingId={listingId}
          kind={config.kind}
          label={config.label}
          hint={config.hint}
          required={config.required}
          documents={documents.filter((d) => d.kind === config.kind)}
        />
      ))}
    </ul>
  );
}

function DocumentSlot({
  listingId,
  kind,
  label,
  hint,
  required,
  documents,
}: {
  listingId: string;
  kind: DocumentKind;
  label: string;
  hint: string;
  required: boolean;
  documents: Document[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const latest = documents[0];

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const body = file.type === "application/pdf" ? file : await shrinkImage(file, 2400, 0.9);
      await uploadFile(`/api/listings/${listingId}/documents`, body, { kind });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <li
      className={`rounded-[var(--radius-control)] border bg-surface p-4 ${
        required && !latest ? "border-plate" : "border-mist"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {label}
            {required ? <span className="ml-2 rounded-full bg-plate px-2 py-0.5 text-xs font-bold">Required</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-muted">{hint}</p>
          {latest ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
              <FileCheck2 aria-hidden className="size-4" />
              {LEVEL_COPY[latest.verification_level]}
              {documents.length > 1 ? <span className="text-muted">({documents.length} files)</span> : null}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latest ? (
            <>
              <button
                type="button"
                className={buttonClass("quiet")}
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const result = await documentLink(latest.id);
                    if (result.url) window.open(result.url, "_blank", "noopener");
                    else setError(result.error ?? "The document could not be opened.");
                  })
                }
              >
                View
              </button>
              {latest.verification_level === "provided" ? (
                <button
                  type="button"
                  className={buttonClass("quiet", "md", "text-danger")}
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Remove this ${label.toLowerCase()}?`)) return;
                    startBusy(async () => {
                      const result = await deleteDocument(listingId, latest.id);
                      if (result.error) setError(result.error);
                    });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </>
          ) : null}
          <label className={buttonClass(required && !latest ? "primary" : "secondary", "md", uploading ? "pointer-events-none opacity-60" : "cursor-pointer")}>
            {uploading ? (
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            ) : (
              <FileUp aria-hidden className="size-4" />
            )}
            {uploading ? "Uploading" : latest ? "Replace" : "Upload"}
            <input
              type="file"
              accept={kind === "odometer_photo" ? "image/*" : "image/*,application/pdf"}
              className="sr-only"
              disabled={uploading}
              aria-label={`Upload ${label}`}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </li>
  );
}
