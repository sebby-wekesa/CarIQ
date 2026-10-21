import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { MediaError, processDocument, processListingPhoto } = await import("./process");

async function photo(width: number, height: number, withGps = false) {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } }).jpeg();
  if (withGps) image = image.withExif({ IFD0: { Copyright: "seller", ImageDescription: "GPS 4.04S 39.66E" } });
  return image.toBuffer();
}

describe("processListingPhoto", () => {
  it("shrinks to 1600px, outputs WebP and a 480px thumbnail", async () => {
    const result = await processListingPhoto(await photo(4000, 3000), "Magari");
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    const full = await sharp(result.full).metadata();
    const thumb = await sharp(result.thumb).metadata();
    expect(full.format).toBe("webp");
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBe(480);
  });

  it("strips metadata such as EXIF", async () => {
    const result = await processListingPhoto(await photo(1200, 900, true), "Magari");
    const meta = await sharp(result.full).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("stamps the watermark in the bottom-right corner only", async () => {
    const result = await processListingPhoto(await photo(1600, 1200), "Magari");
    const raw = await sharp(result.full).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    expect(at(40, 40)).toEqual(expect.arrayContaining([expect.any(Number)]));
    const corner = at(raw.info.width - 60, raw.info.height - 45);
    const topLeft = at(40, 40);
    expect(corner).not.toEqual(topLeft);
    // Away from the corner the photo is untouched (within WebP tolerance).
    expect(Math.abs((topLeft[0] ?? 0) - 200)).toBeLessThan(12);
  });

  it("refuses files that are not images", async () => {
    await expect(processListingPhoto(Buffer.from("hello"), "Magari")).rejects.toBeInstanceOf(MediaError);
  });

  it("refuses tiny photos", async () => {
    await expect(processListingPhoto(await photo(300, 200), "Magari")).rejects.toThrow(/too small/);
  });
});

describe("processDocument", () => {
  it("keeps PDFs as they are", async () => {
    const pdf = Buffer.from("%PDF-1.7\n%…\n");
    const result = await processDocument(pdf);
    expect(result).toMatchObject({ contentType: "application/pdf", extension: "pdf" });
    expect(result.data).toBe(pdf);
  });

  it("converts document photos to JPEG without metadata", async () => {
    const result = await processDocument(await photo(3000, 4000, true));
    const meta = await sharp(result.data).metadata();
    expect(result.contentType).toBe("image/jpeg");
    expect(meta.height).toBe(2400);
    expect(meta.exif).toBeUndefined();
  });

  it("refuses unreadable files", async () => {
    await expect(processDocument(Buffer.from("not a document"))).rejects.toThrow(/PDF or a photo/);
  });
});
