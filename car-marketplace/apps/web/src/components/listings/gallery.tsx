"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

type Photo = { id: string; url: string; thumbUrl: string; width: number | null; height: number | null };

/** Main photo with a thumbnail strip. Arrow keys move between photos. */
export function Gallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) {
    return <div className="aspect-[4/3] rounded-[var(--radius-control)] bg-mist/50" aria-hidden />;
  }
  const current = photos[index] ?? photos[0]!;
  const go = (next: number) => setIndex((next + photos.length) % photos.length);

  return (
    <div
      className="flex flex-col gap-2"
      role="region"
      aria-roledescription="gallery"
      aria-label={`Photos of the ${title}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div className="relative overflow-hidden rounded-[var(--radius-control)] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={`${title}, photo ${index + 1} of ${photos.length}`}
          width={current.width ?? undefined}
          height={current.height ?? undefined}
          className="aspect-[4/3] w-full object-contain"
        />
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-ink shadow-sm"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-ink shadow-sm"
            >
              <ChevronRight className="size-5" />
            </button>
            <span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2.5 py-0.5 text-xs font-semibold text-white">
              {index + 1} / {photos.length}
            </span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, i) => (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={`block overflow-hidden rounded-md border-2 ${i === index ? "border-forest" : "border-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumbUrl} alt="" loading="lazy" className="aspect-[4/3] w-20 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
