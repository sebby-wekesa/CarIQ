import "server-only";
import sharp from "sharp";
import { watermarkSvg } from "./watermark";

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

const PHOTO_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif", "tiff"]);
const MAX_EDGE = 1600;
const THUMB_EDGE = 480;
const MIN_SHORT_EDGE = 320;

export type ProcessedPhoto = { full: Buffer; thumb: Buffer; width: number; height: number };

/**
 * Listing photos: straighten using EXIF orientation, shrink to 1600px, strip all
 * metadata (phone photos carry GPS locations), add the watermark, save as WebP.
 * A 480px thumbnail is made for cards and galleries.
 */
export async function processListingPhoto(input: Buffer, watermarkText: string): Promise<ProcessedPhoto> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new MediaError("That file isn't a photo we can read. Use a JPG or PNG.", 415);
  }
  if (!meta.format || !PHOTO_FORMATS.has(meta.format)) {
    throw new MediaError("That file isn't a photo we can read. Use a JPG or PNG.", 415);
  }

  const resized = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = resized.info;
  if (Math.min(width, height) < MIN_SHORT_EDGE) {
    throw new MediaError("That photo is too small. Use one at least 640 pixels wide.");
  }

  const mark = watermarkSvg(watermarkText, width);
  const margin = Math.round(width * 0.02);
  const full = await sharp(resized.data)
    .composite([{ input: mark.svg, left: width - mark.width - margin, top: height - mark.height - margin }])
    .webp({ quality: 80 })
    .toBuffer();

  const thumb = await sharp(resized.data)
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside" })
    .webp({ quality: 72 })
    .toBuffer();

  return { full, thumb, width, height };
}

export type ProcessedDocument = { data: Buffer; contentType: "application/pdf" | "image/jpeg"; extension: "pdf" | "jpg" };

/** Passport documents: PDFs kept as they are; images straightened, capped at 2400px, metadata stripped. */
export async function processDocument(input: Buffer): Promise<ProcessedDocument> {
  if (input.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { data: input, contentType: "application/pdf", extension: "pdf" };
  }
  try {
    const data = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return { data, contentType: "image/jpeg", extension: "jpg" };
  } catch {
    throw new MediaError("Upload a PDF or a photo of the document (JPG or PNG).", 415);
  }
}
