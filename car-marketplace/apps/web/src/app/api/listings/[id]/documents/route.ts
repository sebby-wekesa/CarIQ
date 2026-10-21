import { DOCUMENT_KINDS, DOCUMENT_MAX_BYTES, type DocumentKind } from "@cm/shared";
import { jsonError, readUpload, requireApiUser } from "@/lib/api";
import { getOwnedListing } from "@/lib/listings/owned";
import { MediaError, processDocument } from "@/lib/media/process";
import { DOCUMENT_BUCKET } from "@/lib/storage";

const KINDS = new Set<string>(DOCUMENT_KINDS.map((d) => d.kind));

/**
 * Upload a Vehicle Passport document (auction sheet, export certificate, logbook,
 * dashboard photo…). Stored privately; buyers only ever see that it was provided.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/documents">) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  const listing = await getOwnedListing(supabase, userId, id);
  if (!listing) return jsonError("Listing not found.", 404);

  const upload = await readUpload(request, "file", DOCUMENT_MAX_BYTES);
  if ("error" in upload) return upload.error;

  const kind = String(upload.form.get("kind") ?? "");
  if (!KINDS.has(kind)) return jsonError("Choose which document this is.", 400);

  let processed;
  try {
    processed = await processDocument(upload.buffer);
  } catch (error) {
    if (error instanceof MediaError) return jsonError(error.message, error.status);
    throw error;
  }

  const storagePath = `${id}/${crypto.randomUUID()}.${processed.extension}`;
  const bucket = supabase.storage.from(DOCUMENT_BUCKET);
  const stored = await bucket.upload(storagePath, processed.data, {
    contentType: processed.contentType,
    upsert: false,
  });
  if (stored.error) {
    console.error("[documents] Storage upload failed", stored.error);
    return jsonError("The document could not be saved. Try again.", 502);
  }

  const { data: document, error } = await supabase
    .from("vehicle_documents")
    .insert({
      listing_id: id,
      kind: kind as DocumentKind,
      storage_path: storagePath,
      content_type: processed.contentType,
      size_bytes: processed.data.length,
    })
    .select("id, kind, content_type, verification_level, created_at")
    .single();

  if (error || !document) {
    await bucket.remove([storagePath]);
    const needsChassis = error?.message.includes("chassis");
    return jsonError(
      needsChassis ? "Add the chassis number before uploading documents." : "The document could not be saved. Try again.",
      needsChassis ? 409 : 500,
    );
  }

  return Response.json(document, { status: 201 });
}
