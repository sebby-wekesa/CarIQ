import { DEALER_DOCUMENT_KINDS, DOCUMENT_MAX_BYTES, type DealerDocumentKind } from "@cm/shared";
import { jsonError, readUpload, requireApiUser } from "@/lib/api";
import { MediaError, processDocument } from "@/lib/media/process";
import { DEALER_DOCUMENT_BUCKET } from "@/lib/storage";

const KINDS = new Set<string>(DEALER_DOCUMENT_KINDS.map((d) => d.kind));

/**
 * Upload a verification document (KRA PIN certificate, business registration, owner's ID).
 * Stored privately in the dealer's folder; only its owners, managers and our reviewers can open it.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/dealers/[id]/documents">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Dealership not found.", 404);
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: dealer } = await supabase.rpc("my_dealers").then((r) => ({ data: r.data?.find((d) => d.id === id) }));
  if (!dealer) return jsonError("Dealership not found.", 404);
  if (dealer.role === "sales") return jsonError("Only owners and managers can upload documents.", 403);
  if (dealer.status === "approved") return jsonError("Your dealership is already verified. Contact support to update documents.", 409);

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
  const bucket = supabase.storage.from(DEALER_DOCUMENT_BUCKET);
  const stored = await bucket.upload(storagePath, processed.data, { contentType: processed.contentType, upsert: false });
  if (stored.error) {
    console.error("[dealer documents] Storage upload failed", stored.error);
    return jsonError("The document could not be saved. Try again.", 502);
  }

  const { data: document, error } = await supabase
    .from("dealer_documents")
    .insert({
      dealer_id: id,
      kind: kind as DealerDocumentKind,
      storage_path: storagePath,
      content_type: processed.contentType,
      size_bytes: processed.data.length,
    })
    .select("id, kind, content_type, created_at")
    .single();
  if (error || !document) {
    console.error("[dealer documents] insert failed", error);
    await bucket.remove([storagePath]);
    return jsonError("The document could not be saved. Try again.", 500);
  }
  return Response.json(document, { status: 201 });
}
