import { env } from "@/lib/env";

export const PHOTO_BUCKET = "listing-photos";
export const DOCUMENT_BUCKET = "vehicle-documents";
export const DEALER_DOCUMENT_BUCKET = "dealer-documents";

/** Public URL for a listing photo (the bucket is public; documents are not). */
export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${env.supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
