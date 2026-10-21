import { revalidateTag } from "next/cache";
import { MAX_PHOTOS, PHOTO_MAX_BYTES } from "@cm/shared";
import { jsonError, readUpload, requireApiUser } from "@/lib/api";
import { env } from "@/lib/env";
import { getOwnedListing } from "@/lib/listings/owned";
import { MediaError, processListingPhoto } from "@/lib/media/process";
import { PHOTO_BUCKET, photoUrl } from "@/lib/storage";

/**
 * Upload one listing photo. The browser has already shrunk it; here we straighten it,
 * strip metadata (GPS), watermark it, make a thumbnail and store both.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/photos">) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  const listing = await getOwnedListing(supabase, userId, id);
  if (!listing) return jsonError("Listing not found.", 404);
  if (listing.status === "sold") return jsonError("This car is marked sold, so its photos are locked.", 409);

  const { count } = await supabase
    .from("listing_media")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", id);
  if ((count ?? 0) >= MAX_PHOTOS) return jsonError(`A listing can have up to ${MAX_PHOTOS} photos.`, 409);

  const upload = await readUpload(request, "file", PHOTO_MAX_BYTES);
  if ("error" in upload) return upload.error;

  let processed;
  try {
    processed = await processListingPhoto(upload.buffer, env.appName);
  } catch (error) {
    if (error instanceof MediaError) return jsonError(error.message, error.status);
    throw error;
  }

  const fileId = crypto.randomUUID();
  const storagePath = `${id}/${fileId}.webp`;
  const thumbPath = `${id}/${fileId}_thumb.webp`;
  const bucket = supabase.storage.from(PHOTO_BUCKET);

  const [full, thumb] = await Promise.all([
    bucket.upload(storagePath, processed.full, { contentType: "image/webp", cacheControl: "31536000", upsert: false }),
    bucket.upload(thumbPath, processed.thumb, { contentType: "image/webp", cacheControl: "31536000", upsert: false }),
  ]);
  if (full.error || thumb.error) {
    console.error("[photos] Storage upload failed", full.error ?? thumb.error);
    await bucket.remove([storagePath, thumbPath]);
    return jsonError("The photo could not be saved. Try again.", 502);
  }

  const { data: last } = await supabase
    .from("listing_media")
    .select("position")
    .eq("listing_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: media, error } = await supabase
    .from("listing_media")
    .insert({
      listing_id: id,
      storage_path: storagePath,
      thumb_path: thumbPath,
      position: (last?.position ?? -1) + 1,
      width: processed.width,
      height: processed.height,
    })
    .select("id, position, width, height")
    .single();

  if (error || !media) {
    await bucket.remove([storagePath, thumbPath]);
    const limit = error?.message.includes("up to 20 photos");
    return jsonError(limit ? `A listing can have up to ${MAX_PHOTOS} photos.` : "The photo could not be saved. Try again.", limit ? 409 : 500);
  }

  revalidateTag(`listing:${id}`, "max");
  return Response.json(
    { ...media, url: photoUrl(storagePath), thumbUrl: photoUrl(thumbPath) },
    { status: 201 },
  );
}
