import "server-only";
import { createClient } from "@/lib/supabase/server";

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** For route handlers: the request's Supabase client and signed-in user id, or a 401 response. */
export async function requireApiUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: jsonError("Sign in to continue.", 401) } as const;
  return { supabase, userId } as const;
}

/** Reads a single uploaded file from multipart form data. */
export async function readUpload(request: Request, field = "file", maxBytes: number) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { error: jsonError("Send the file as a form upload.", 400) } as const;
  }
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return { error: jsonError("Choose a file to upload.", 400) } as const;
  if (file.size > maxBytes) {
    return { error: jsonError(`That file is over ${Math.round(maxBytes / 1024 / 1024)} MB. Choose a smaller one.`, 413) } as const;
  }
  return { form, file, buffer: Buffer.from(await file.arrayBuffer()) } as const;
}
