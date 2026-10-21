"use client";

import { FileCheck2, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DEALER_DOCUMENT_KINDS, type DealerDocumentKind } from "@cm/shared";
import { shrinkImage, uploadFile } from "@/lib/media/client-resize";
import { formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { dealerDocumentLink, deleteDealerDocument, resubmitDealer } from "./actions";

export type DealerDocument = { id: string; kind: DealerDocumentKind; content_type: string; created_at: string };

type Props = {
  dealerId: string;
  documents: DealerDocument[];
  /** Rejected dealers send the application back once they've fixed it. */
  canResubmit: boolean;
};

export function DealerDocuments({ dealerId, documents, canResubmit }: Props) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, start] = useTransition();
  const missing = DEALER_DOCUMENT_KINDS.filter((k) => k.required && !documents.some((d) => d.kind === k.kind));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {DEALER_DOCUMENT_KINDS.map((config) => (
          <Slot
            key={config.kind}
            dealerId={dealerId}
            kind={config.kind}
            label={config.label}
            hint={config.hint}
            required={config.required}
            documents={documents.filter((d) => d.kind === config.kind)}
          />
        ))}
      </ul>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {canResubmit ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-mist bg-surface p-4">
          <p className="text-ink-soft">
            {missing.length
              ? `Upload the ${missing.map((m) => m.label.toLowerCase()).join(" and ")} first.`
              : "Fixed what we asked? Send your application back and we'll look again."}
          </p>
          <Button
            type="button"
            className="sm:self-start"
            disabled={missing.length > 0}
            pending={busy}
            onClick={() =>
              start(async () => {
                const result = await resubmitDealer(dealerId);
                setMessage(result.errors?._form ? { tone: "error", text: result.errors._form } : { tone: "success", text: "Sent back for review." });
              })
            }
          >
            Send back for review
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Slot({
  dealerId,
  kind,
  label,
  hint,
  required,
  documents,
}: {
  dealerId: string;
  kind: DealerDocumentKind;
  label: string;
  hint: string;
  required: boolean;
  documents: DealerDocument[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const latest = documents[0];

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const body = file.type === "application/pdf" ? file : await shrinkImage(file, 2400, 0.9);
      await uploadFile(`/api/dealers/${dealerId}/documents`, body, { kind });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <li className={`rounded-[var(--radius-control)] border bg-surface p-4 ${required && !latest ? "border-plate" : "border-mist"}`}>
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
              Uploaded {formatDate(latest.created_at)}
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
                  start(async () => {
                    const result = await dealerDocumentLink(latest.id);
                    if (result.url) window.open(result.url, "_blank", "noopener");
                    else setError(result.error ?? "The document could not be opened.");
                  })
                }
              >
                View
              </button>
              <button
                type="button"
                className={buttonClass("quiet", "md", "text-danger")}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Remove this ${label.toLowerCase()}?`)) return;
                  start(async () => {
                    const result = await deleteDealerDocument(dealerId, latest.id);
                    if (result.errors?._form) setError(result.errors._form);
                  });
                }}
              >
                Remove
              </button>
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
              accept="image/*,application/pdf"
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
