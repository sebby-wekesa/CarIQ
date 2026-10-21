/**
 * Where to send someone after sign-in. Only same-site paths are allowed, so a
 * crafted ?next=https://evil.example link cannot bounce users off-site.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login/")) return fallback;
  return value;
}
