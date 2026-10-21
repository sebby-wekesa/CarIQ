/**
 * Our database rules raise messages written for sellers ("Add at least 3 photos…").
 * Pass those through; replace anything technical with a plain instruction.
 */
export function friendlyDbError(
  error: { code?: string; message?: string } | null | undefined,
  fallback = "That didn't save. Try again.",
): string {
  if (!error) return fallback;
  if (error.code === "23505" && error.message?.includes("listings_one_active_per_vehicle")) {
    return "This car already has a listing under review or on sale. If it's yours, contact support so we can check the chassis number.";
  }
  const ours = ["23514", "42501", "22023", "P0002"].includes(error.code ?? "");
  const technical = /row-level security|violates|permission denied|constraint|syntax|relation/i.test(error.message ?? "");
  if (ours && error.message && !technical) return error.message;
  return fallback;
}
