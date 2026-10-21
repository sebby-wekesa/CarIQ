#!/usr/bin/env node
// Generates packages/db/src/database.types.ts from a migrated database, in the same
// shape as `supabase gen types typescript`, so supabase-js queries are fully typed.
//
// Works on plain Postgres (no Docker needed). Normally run via:
//   pnpm db:test -- --types        (throwaway database)
//   DATABASE_URL=... node scripts/gen-db-types.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "packages/db/src/database.types.ts");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function query(sql) {
  const raw = execFileSync("psql", [url, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
  return raw ? JSON.parse(raw) : [];
}

const tables = query(`
  select coalesce(json_agg(c order by c.table_name, c.ordinal_position), '[]')
  from (
    select col.table_name, col.column_name, col.ordinal_position, col.udt_name,
           col.is_nullable = 'YES' as nullable,
           col.column_default is not null as has_default,
           col.is_identity = 'YES' as is_identity,
           col.identity_generation, col.is_generated = 'ALWAYS' as generated,
           coalesce(col_description(format('public.%I', col.table_name)::regclass, col.ordinal_position::int)
                    ~* 'set by trigger', false) as trigger_set
      from information_schema.columns col
      join pg_tables t on t.schemaname = col.table_schema and t.tablename = col.table_name
     where col.table_schema = 'public'
  ) c`);

const views = query(`
  select coalesce(json_agg(c order by c.table_name, c.ordinal_position), '[]')
  from (
    select col.table_name, col.column_name, col.ordinal_position, col.udt_name
      from information_schema.columns col
      join pg_views v on v.schemaname = col.table_schema and v.viewname = col.table_name
     where col.table_schema = 'public'
  ) c`);

const enums = query(`
  select coalesce(json_agg(e order by e.name), '[]') from (
    select t.typname as name, json_agg(en.enumlabel order by en.enumsortorder) as labels
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
      join pg_enum en on en.enumtypid = t.oid
     group by t.typname
  ) e`);

const fks = query(`
  select coalesce(json_agg(f order by f.table_name, f.name), '[]') from (
    select con.conname as name,
           src.relname as table_name,
           dst.relname as ref_table,
           (select json_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as columns,
           (select json_agg(a.attname order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as ref_columns,
           exists (
             select 1 from pg_index i
              where i.indrelid = con.conrelid and i.indisunique
                and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x)
                  = (select array_agg(x order by x) from unnest(con.conkey) x)
           ) as one_to_one
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_namespace sn on sn.oid = src.relnamespace and sn.nspname = 'public'
      join pg_class dst on dst.oid = con.confrelid
      join pg_namespace dn on dn.oid = dst.relnamespace and dn.nspname = 'public'
     where con.contype = 'f'
  ) f`);

const functions = query(`
  select coalesce(json_agg(f order by f.name), '[]') from (
    select p.proname as name,
           pg_get_function_result(p.oid) as returns,
           p.pronargdefaults as n_defaults,
           -- Input arguments only: TABLE(...) functions list their output columns here too.
           coalesce((select json_agg(json_build_object('name', a.name, 'type', format_type(a.type, null)) order by a.ord)
                       from unnest(p.proargnames, coalesce(p.proallargtypes, p.proargtypes::oid[]),
                                   coalesce(p.proargmodes, array_fill('i'::"char", array[p.pronargs::int])))
                            with ordinality as a(name, type, mode, ord)
                      where a.mode in ('i', 'b', 'v')), '[]') as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.prokind = 'f'
  ) f`);

const enumNames = new Set(enums.map((e) => e.name));

function tsType(udt) {
  if (udt.startsWith("_")) return `${tsType(udt.slice(1))}[]`;
  if (enumNames.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
  switch (udt) {
    case "int2":
    case "int4":
    case "int8":
    case "float4":
    case "float8":
    case "numeric":
      return "number";
    case "bool":
      return "boolean";
    case "json":
    case "jsonb":
      return "Json";
    case "text":
    case "varchar":
    case "bpchar":
    case "uuid":
    case "citext":
    case "date":
    case "time":
    case "timestamp":
    case "timestamptz":
    case "interval":
      return "string";
    default:
      return "unknown";
  }
}

function sqlTypeToTs(sqlType) {
  if (sqlType.endsWith("[]")) return `${sqlTypeToTs(sqlType.slice(0, -2))}[]`;
  if (enumNames.has(sqlType.replace(/^public\./, ""))) return `Database["public"]["Enums"]["${sqlType.replace(/^public\./, "")}"]`;
  const map = {
    boolean: "boolean",
    text: "string",
    uuid: "string",
    integer: "number",
    bigint: "number",
    smallint: "number",
    jsonb: "Json",
    json: "Json",
    void: "undefined",
    "timestamp with time zone": "string",
    "character varying": "string",
    date: "string",
  };
  return map[sqlType] ?? "unknown";
}

const byTable = new Map();
for (const col of tables) {
  if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
  byTable.get(col.table_name).push(col);
}

const indent = (n) => " ".repeat(n);
const lines = [];
const push = (s = "") => lines.push(s);

push("// AUTO-GENERATED by scripts/gen-db-types.mjs — do not edit by hand.");
push("// Regenerate after changing migrations: pnpm db:types");
push();
push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];");
push();
push("export type Database = {");
push(`${indent(2)}public: {`);
push(`${indent(4)}Tables: {`);
for (const [table, cols] of byTable) {
  push(`${indent(6)}${table}: {`);
  push(`${indent(8)}Row: {`);
  for (const c of cols) push(`${indent(10)}${c.column_name}: ${tsType(c.udt_name)}${c.nullable ? " | null" : ""};`);
  push(`${indent(8)}};`);
  push(`${indent(8)}Insert: {`);
  for (const c of cols) {
    if (c.identity_generation === "ALWAYS" || c.generated) {
      push(`${indent(10)}${c.column_name}?: never;`);
      continue;
    }
    // Columns documented as "set by trigger" are filled in by the database.
    const optional = c.nullable || c.has_default || c.is_identity || c.trigger_set;
    push(`${indent(10)}${c.column_name}${optional ? "?" : ""}: ${tsType(c.udt_name)}${c.nullable ? " | null" : ""};`);
  }
  push(`${indent(8)}};`);
  push(`${indent(8)}Update: {`);
  for (const c of cols) {
    if (c.identity_generation === "ALWAYS" || c.generated) {
      push(`${indent(10)}${c.column_name}?: never;`);
      continue;
    }
    push(`${indent(10)}${c.column_name}?: ${tsType(c.udt_name)}${c.nullable ? " | null" : ""};`);
  }
  push(`${indent(8)}};`);
  const rels = fks.filter((f) => f.table_name === table);
  if (rels.length === 0) {
    push(`${indent(8)}Relationships: [];`);
  } else {
    push(`${indent(8)}Relationships: [`);
    for (const r of rels) {
      push(`${indent(10)}{`);
      push(`${indent(12)}foreignKeyName: "${r.name}";`);
      push(`${indent(12)}columns: [${r.columns.map((c) => `"${c}"`).join(", ")}];`);
      push(`${indent(12)}isOneToOne: ${r.one_to_one};`);
      push(`${indent(12)}referencedRelation: "${r.ref_table}";`);
      push(`${indent(12)}referencedColumns: [${r.ref_columns.map((c) => `"${c}"`).join(", ")}];`);
      push(`${indent(10)}},`);
    }
    push(`${indent(8)}];`);
  }
  push(`${indent(6)}};`);
}
push(`${indent(4)}};`);
const byView = new Map();
for (const col of views) {
  if (!byView.has(col.table_name)) byView.set(col.table_name, []);
  byView.get(col.table_name).push(col);
}
if (byView.size === 0) {
  push(`${indent(4)}Views: { [_ in never]: never };`);
} else {
  push(`${indent(4)}Views: {`);
  for (const [view, cols] of byView) {
    push(`${indent(6)}${view}: {`);
    push(`${indent(8)}Row: {`);
    // Postgres reports every view column as nullable, as does supabase gen types.
    for (const c of cols) push(`${indent(10)}${c.column_name}: ${tsType(c.udt_name)} | null;`);
    push(`${indent(8)}};`);
    push(`${indent(8)}Relationships: [];`);
    push(`${indent(6)}};`);
  }
  push(`${indent(4)}};`);
}
push(`${indent(4)}Functions: {`);
for (const f of functions) {
  const firstOptional = f.args.length - (f.n_defaults ?? 0);
  const args = f.args.length
    ? `{ ${f.args.map((a, i) => `${a.name}${i >= firstOptional ? "?" : ""}: ${sqlTypeToTs(a.type)}`).join("; ")} }`
    : "Record<PropertyKey, never>";
  const setof = f.returns.match(/^SETOF (?:public\.)?([a-z_][a-z0-9_]*)$/);
  const table = f.returns.match(/^TABLE\((.*)\)$/s);
  if (setof && (byView.has(setof[1]) || byTable.has(setof[1]))) {
    const kind = byView.has(setof[1]) ? "Views" : "Tables";
    push(`${indent(6)}${f.name}: {`);
    push(`${indent(8)}Args: ${args};`);
    push(`${indent(8)}Returns: Database["public"]["${kind}"]["${setof[1]}"]["Row"][];`);
    push(`${indent(8)}SetofOptions: { from: "*"; to: "${setof[1]}"; isOneToOne: false; isSetofReturn: true };`);
    push(`${indent(6)}};`);
  } else if (table) {
    // "TABLE(a text, b bigint)" → { a: string; b: number }[]. Function results can always be null.
    const cols = table[1].split(/,\s*(?![^()]*\))/).map((c) => {
      const [, name, type] = c.trim().match(/^"?([a-z_][a-z0-9_]*)"?\s+(.+)$/);
      return `${name}: ${sqlTypeToTs(type.replace(/^public\./, ""))} | null`;
    });
    push(`${indent(6)}${f.name}: { Args: ${args}; Returns: { ${cols.join("; ")} }[] };`);
  } else {
    push(`${indent(6)}${f.name}: { Args: ${args}; Returns: ${sqlTypeToTs(f.returns)} };`);
  }
}
push(`${indent(4)}};`);
push(`${indent(4)}Enums: {`);
for (const e of enums) push(`${indent(6)}${e.name}: ${e.labels.map((l) => `"${l}"`).join(" | ")};`);
push(`${indent(4)}};`);
push(`${indent(4)}CompositeTypes: { [_ in never]: never };`);
push(`${indent(2)}};`);
push("};");
push();
push('type PublicSchema = Database["public"];');
push('export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];');
push('export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];');
push('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];');
push('export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];');
push();

writeFileSync(out, lines.join("\n"));
console.log(`• Wrote ${byTable.size} tables, ${byView.size} views, ${functions.length} functions, ${enums.length} enums, ${fks.length} relationships to ${out.replace(root + "/", "")}`);
