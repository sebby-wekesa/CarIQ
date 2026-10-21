"use client";

import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { MAX_PHOTOS } from "@cm/shared";
import { shrinkImage, uploadFile } from "@/lib/media/client-resize";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { deletePhoto, reorderPhotos } from "../actions";

type Photo = { id: string; url: string; thumbUrl: string };
type Upload = { key: string; name: string; error?: string };

export function PhotoManager({ listingId, photos, locked }: { listingId: string; photos: Photo[]; locked: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const room = MAX_PHOTOS - photos.length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const picked = Array.from(files).slice(0, Math.max(room, 0));
    if (files.length > picked.length) setError(`Only ${MAX_PHOTOS} photos fit. The first ${picked.length} will be added.`);

    const queue = picked.map((file, i) => ({ key: `${Date.now()}-${i}`, name: file.name }));
    setUploads((current) => [...current, ...queue]);

    // One at a time keeps memory low on older phones and keeps the order the seller chose.
    for (const [i, file] of picked.entries()) {
      const key = queue[i]!.key;
      try {
        const small = await shrinkImage(file);
        await uploadFile(`/api/listings/${listingId}/photos`, small);
        setUploads((current) => current.filter((u) => u.key !== key));
        router.refresh();
      } catch (e) {
        setUploads((current) =>
          current.map((u) => (u.key === key ? { ...u, error: e instanceof Error ? e.message : "Upload failed." } : u)),
        );
      }
    }
    if (input.current) input.current.value = "";
  }

  function move(index: number, to: number) {
    const ids = photos.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(to, 0, moved!);
    startBusy(async () => {
      const result = await reorderPhotos(listingId, ids);
      if (result.error) setError(result.error);
    });
  }

  function remove(id: string) {
    if (!window.confirm("Remove this photo?")) return;
    startBusy(async () => {
      const result = await deletePhoto(listingId, id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {photos.length > 0 ? (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Listing photos in order">
          {photos.map((photo, index) => (
            <li key={photo.id} className="overflow-hidden rounded-[var(--radius-control)] border border-mist bg-surface">
              <div className="relative aspect-[4/3] bg-mist/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumbUrl} alt={`Photo ${index + 1}`} className="size-full object-cover" />
                {index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-full bg-plate px-2 py-0.5 text-xs font-bold text-ink">Cover</span>
                ) : null}
              </div>
              {!locked ? (
                <div className="flex items-center justify-between gap-1 p-1.5">
                  <IconButton label="Move earlier" disabled={busy || index === 0} onClick={() => move(index, index - 1)}>
                    <ArrowLeft className="size-4" />
                  </IconButton>
                  <IconButton label="Make cover photo" disabled={busy || index === 0} onClick={() => move(index, 0)}>
                    <Star className="size-4" />
                  </IconButton>
                  <IconButton label="Move later" disabled={busy || index === photos.length - 1} onClick={() => move(index, index + 1)}>
                    <ArrowRight className="size-4" />
                  </IconButton>
                  <IconButton label="Remove photo" disabled={busy} onClick={() => remove(photo.id)} danger>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {uploads.map((upload) => (
            <li
              key={upload.key}
              className={upload.error ? "text-sm font-medium text-danger" : "flex items-center gap-2 text-sm text-ink-soft"}
            >
              {upload.error ? (
                `${upload.name}: ${upload.error}`
              ) : (
                <>
                  <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-forest border-r-transparent" />
                  Uploading {upload.name}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {!locked ? (
        <div className="flex flex-wrap items-center gap-4">
          <label className={buttonClass(photos.length < 3 ? "primary" : "secondary", "lg", room <= 0 ? "pointer-events-none opacity-60" : "cursor-pointer")}>
            <ImagePlus aria-hidden className="size-5" />
            {photos.length === 0 ? "Add photos" : "Add more photos"}
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={room <= 0}
              onChange={(event) => handleFiles(event.target.files)}
            />
          </label>
          <p className="text-sm text-muted">
            {photos.length} of {MAX_PHOTOS} photos. Shrunk on your phone before upload to save data.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  children,
  danger,
  ...props
}: React.ComponentProps<"button"> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`grid size-10 place-items-center rounded-md transition-colors disabled:opacity-30 ${
        danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}
