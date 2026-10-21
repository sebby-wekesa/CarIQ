import { z } from "zod";

/**
 * Public configuration, validated once. NEXT_PUBLIC_* values are inlined at build
 * time, so each one must be referenced by its full literal name below.
 */
const schema = z.object({
  appName: z.string().min(1).default("Magari"),
  siteUrl: z.url().default("http://localhost:3000"),
  supabaseUrl: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a URL (see apps/web/.env.example)" }),
  supabaseKey: z.string({ error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing (see apps/web/.env.example)" }).min(1),
});

const parsed = schema.safeParse({
  appName: process.env.NEXT_PUBLIC_APP_NAME || undefined,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  • ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

export const env = parsed.data;
