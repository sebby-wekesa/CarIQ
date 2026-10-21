export type { Database, Enums, Json, Tables, TablesInsert, TablesUpdate } from "./database.types";

/**
 * Columns the API is allowed to read on `profiles`. `phone` and `role` are not
 * granted — selecting them (or `*`) fails with "permission denied".
 */
export const PUBLIC_PROFILE_COLUMNS = "id, full_name, county_code, avatar_url, created_at" as const;
