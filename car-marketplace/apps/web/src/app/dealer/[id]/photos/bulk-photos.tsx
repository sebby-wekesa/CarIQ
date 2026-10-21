"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CheckCircle2, Gauge, ImagePlus, XCircle } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { MAX_PHOTOS, MIN_PHOTOS_TO_SUBMIT, matchPhotoFile } from "@cm/shared";
import { shrinkImage, uploadFile } from "@/lib/media/client-resize";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { submitReadyStock } from "../../actions";

export type PhotoCar = {
  listingId: string;
  title: string;
  chassis: string;
  chassisKey: string;
  status: string;
  photoCount: number;
  hasDashboard: boolean;
};

type Planned = { file: File; isOdometer: boolean; order: number };
type Progress = { done: number; failed: string[] };

const PARALLEL = 3;

export function BulkPhotos({ dealerId, cars }: { dealerId: string; cars: PhotoCar[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const keys = useMemo(() => cars.map((c) => c.chassisKey), [cars]);
  const { byCar, unmatched } = useMemo(() => {
    const byCar = new Map<string, Planned[]>();
    const unmatched: File[] = [];
    for (const file of files) {
      const match = matchPhotoFile(file.name, keys);
      if (!match) {
        unmatched.push(file);
        continue;
      }
      const list = byCar.get(match.chassisKey) ?? [];
      list.push({ file, isOdometer: match.isOdometer, order: match.order });
      byCar.set(match.chassisKey, list);
    }
    for (const list of byCar.values()) list.sort((a, b) => a.order - b.order || a.file.name.localeCompare(b.file.name));
    return { byCar, unmatched };
  }, [files, keys]);

  const total = [...byCar.values()].reduce((n, l) => n + l.length, 0);
  const matchedCars = cars.filter((c) => byCar.has(c.chassisKey));

  function add(list: FileList | null) {
    if (!list) return;
    const images = [...list].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
      return [...current, ...images.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
    setFinished(false);
  }

  async function start() {
    setRunning(true);
    setFinished(false);
    const jobs: { car: PhotoCar; item: Planned }[] = [];
    for (const car of matchedCars) {
      let room = MAX_PHOTOS - car.photoCount;
      for (const item of byCar.get(car.chassisKey) ?? []) {
        if (!item.isOdometer && room <= 0) continue;
        if (!item.isOdometer) room--;
        jobs.push({ car, item });
      }
    }
    setProgress(Object.fromEntries(matchedCars.map((c) => [c.listingId, { done: 0, failed: [] }])));

    // Photos for one car go in order so the first file becomes the cover; cars upload side by side.
    const queues = new Map<string, typeof jobs>();
    for (const job of jobs) queues.set(job.car.listingId, [...(queues.get(job.car.listingId) ?? []), job]);
    const carQueues = [...queues.values()];
    let next = 0;
    async function worker() {
      while (next < carQueues.length) {
        const queue = carQueues[next++]!;
        for (const { car, item } of queue) {
          try {
            if (item.isOdometer) {
              const body = await shrinkImage(item.file, 2400, 0.9);
              await uploadFile(`/api/listings/${car.listingId}/documents`, body, { kind: "odometer_photo" });
            } else {
              const body = await shrinkImage(item.file);
              await uploadFile(`/api/listings/${car.listingId}/photos`, body);
            }
            setProgress((p) => ({ ...p, [car.listingId]: { ...p[car.listingId]!, done: p[car.listingId]!.done + 1 } }));
          } catch (e) {
            const message = `${item.file.name}: ${e instanceof Error ? e.message : "upload failed"}`;
            setProgress((p) => ({ ...p, [car.listingId]: { ...p[car.listingId]!, failed: [...p[car.listingId]!.failed, message] } }));
          }
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setRunning(false);
    setFinished(true);
    setFiles([]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-3xl">
        <h2 className="text-xl font-bold">Add photos for many cars at once</h2>
        <p className="mt-1 text-ink-soft">
          Start each file name with the car&apos;s chassis number and we&apos;ll put it on the right car:{" "}
          <code className="font-semibold">NZE161-7012345_1.jpg</code>, <code className="font-semibold">NZE161-7012345_2.jpg</code>…
          Name the dashboard photo <code className="font-semibold">NZE161-7012345_dash.jpg</code>: it goes to the Vehicle
          Passport as proof of mileage. Photo 1 is the cover.
        </p>
      </div>

      {finished ? (
        <FinishedPanel
          cars={cars.filter((c) => progress[c.listingId])}
          progress={progress}
          submitting={submitting}
          submitMessage={submitMessage}
          dealerId={dealerId}
          onSubmit={() =>
            startSubmit(async () => {
              const result = await submitReadyStock(dealerId);
              setSubmitMessage(result.errors?._form ?? result.message ?? null);
              router.refresh();
            })
          }
        />
      ) : null}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={clsx(
          "flex max-w-3xl cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-control)] border-2 border-dashed px-6 py-10 text-center",
          dragging ? "border-forest bg-success-soft" : "border-mist bg-surface hover:border-ink/30",
          running && "pointer-events-none opacity-60",
        )}
      >
        <ImagePlus aria-hidden className="size-10 text-forest" />
        <span className="text-lg font-semibold">Choose photos</span>
        <span className="text-sm text-muted">Select all of them at once, or drop them here</span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Car photos"
          disabled={running}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length ? (
        <section aria-labelledby="matched-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="matched-heading" className="text-xl font-bold">
              {total} {total === 1 ? "photo" : "photos"} for {matchedCars.length} {matchedCars.length === 1 ? "car" : "cars"}
            </h2>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" disabled={running} onClick={() => setFiles([])}>
                Clear
              </Button>
              <Button type="button" size="lg" disabled={!total} pending={running} onClick={start}>
                {running ? "Uploading" : `Upload ${total} ${total === 1 ? "photo" : "photos"}`}
              </Button>
            </div>
          </div>

          {unmatched.length ? (
            <Alert tone="error">
              <p>
                {unmatched.length} {unmatched.length === 1 ? "file doesn't" : "files don't"} start with the chassis number of
                one of your cars and will be skipped:
              </p>
              <p className="mt-1 font-normal">{unmatched.slice(0, 8).map((f) => f.name).join(", ")}{unmatched.length > 8 ? "…" : ""}</p>
            </Alert>
          ) : null}

          <ul className="divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface" aria-label="Cars and their photos">
            {matchedCars.map((car) => {
              const planned = byCar.get(car.chassisKey) ?? [];
              const photos = planned.filter((p) => !p.isOdometer).length;
              const dash = planned.some((p) => p.isOdometer);
              const after = car.photoCount + photos;
              const p = progress[car.listingId];
              return (
                <li key={car.listingId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{car.title}</p>
                    <p className="text-sm text-muted">
                      {car.chassis} · {photos} new {photos === 1 ? "photo" : "photos"}
                      {car.photoCount ? ` (has ${car.photoCount})` : ""}
                      {dash ? " · dashboard photo" : ""}
                    </p>
                    {after < MIN_PHOTOS_TO_SUBMIT ? (
                      <p className="text-sm font-medium text-danger">Needs {MIN_PHOTOS_TO_SUBMIT - after} more to go on sale.</p>
                    ) : null}
                    {!dash && !car.hasDashboard ? (
                      <p className="text-sm font-medium text-danger">No dashboard photo yet.</p>
                    ) : null}
                  </div>
                  {p ? (
                    <span className="text-sm font-semibold">
                      {p.done}/{planned.length}
                    </span>
                  ) : dash || car.hasDashboard ? (
                    <Gauge aria-label="Has dashboard photo" className="size-5 text-success" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <CarsWithoutPhotos cars={cars} dealerId={dealerId} />
    </div>
  );
}

function FinishedPanel({
  cars,
  progress,
  submitting,
  submitMessage,
  dealerId,
  onSubmit,
}: {
  cars: PhotoCar[];
  progress: Record<string, Progress>;
  submitting: boolean;
  submitMessage: string | null;
  dealerId: string;
  onSubmit: () => void;
}) {
  const uploaded = Object.values(progress).reduce((n, p) => n + p.done, 0);
  const failures = cars.flatMap((c) => progress[c.listingId]?.failed.map((f) => `${c.title} — ${f}`) ?? []);
  return (
    <div className="flex max-w-3xl flex-col gap-3 rounded-[var(--radius-control)] border border-mist bg-surface p-4">
      <p className="flex items-center gap-2 font-semibold text-success">
        <CheckCircle2 aria-hidden className="size-5" />
        {uploaded} {uploaded === 1 ? "file" : "files"} uploaded for {cars.length} {cars.length === 1 ? "car" : "cars"}.
      </p>
      {failures.length ? (
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {failures.map((f) => (
            <li key={f} className="flex gap-1.5">
              <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      ) : null}
      {submitMessage ? <Alert tone="success">{submitMessage}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" pending={submitting} onClick={onSubmit}>
          Submit all ready cars
        </Button>
        <ButtonLink href={`/dealer/${dealerId}/stock`} variant="secondary">
          See stock
        </ButtonLink>
      </div>
    </div>
  );
}

function CarsWithoutPhotos({ cars, dealerId }: { cars: PhotoCar[]; dealerId: string }) {
  const waiting = cars.filter((c) => c.photoCount < MIN_PHOTOS_TO_SUBMIT || !c.hasDashboard);
  if (!waiting.length) return null;
  return (
    <section aria-labelledby="waiting-heading" className="max-w-3xl">
      <h2 id="waiting-heading" className="text-lg font-bold">
        Still need photos ({waiting.length})
      </h2>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {waiting.map((c) => (
          <li key={c.listingId}>
            <Link href={`/sell/${c.listingId}`} className="font-semibold text-forest underline-offset-4 hover:underline">
              {c.title}
            </Link>{" "}
            <span className="text-muted">
              {c.chassis} · {c.photoCount} photos{c.hasDashboard ? "" : ", no dashboard"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Or open a car to add photos from your phone.{" "}
        <Link href={`/dealer/${dealerId}/stock?status=draft`} className="font-semibold text-forest underline-offset-4 hover:underline">
          All drafts
        </Link>
      </p>
    </section>
  );
}
