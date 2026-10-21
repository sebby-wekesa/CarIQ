"use client";

/**
 * Shrink a phone photo in the browser before upload. A 12-megapixel photo is
 * 4–6 MB; at 2000px it is a few hundred KB, which matters on mobile data.
 * The server still does the final resize, watermark and metadata strip.
 */
export async function shrinkImage(file: File, maxEdge = 2000, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    // Formats the browser can't decode (some HEIC files) go up as-is; the server decides.
    return file;
  }
}

export async function uploadFile(url: string, file: Blob, fields: Record<string, string> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set("file", file, file instanceof File ? file.name : "upload.jpg");
  const response = await fetch(url, { method: "POST", body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Upload failed. Try again.");
  return data;
}
