// Generates src/types/database.ts (Supabase-js format) by introspecting a
// PostgreSQL database that has the migrations applied.
//
// Usage: DATABASE_URL=postgres://... node scripts/gen-db-types.mjs
// When a Supabase project is linked you can instead run:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts
import { writeFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const enums = await q(`
  select t.typname::text as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by t.typname`);
const enumNames = new Set(enums.map((e) => e.name));

function tsType(udt, isArray) {
  const base = udt.replace(/^_/, "");
  let t;
  if (enumNames.has(base)) t = `Database["public"]["Enums"]["${base}"]`;
  else if (["int2", "int4", "int8", "float4", "float8", "numeric"].includes(base)) t = "number";
  else if (base === "bool") t = "boolean";
  else if (["json", "jsonb"].includes(base)) t = "Json";
  else if (base === "void") t = "undefined";
  else t = "string";
  return isArray || udt.startsWith("_") ? `${t}[]` : t;
}

const columns = await q(`
  select c.table_name, c.column_name, c.udt_name, c.is_nullable = 'YES' as nullable,
         (c.column_default is not null or c.is_identity = 'YES' or c.is_generated = 'ALWAYS') as has_default,
         c.is_generated = 'ALWAYS' or c.is_identity = 'YES' and c.identity_generation = 'ALWAYS' as generated
  from information_schema.columns c
  join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
  order by c.table_name, c.ordinal_position`);

const viewColumns = await q(`
  select c.table_name, c.column_name, c.udt_name
  from information_schema.columns c
  join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
  where c.table_schema = 'public' and t.table_type = 'VIEW'
  order by c.table_name, c.ordinal_position`);
const views = {};
for (const c of viewColumns) (views[c.table_name] ??= []).push(c);

const fks = await q(`
  select con.conname, cl.relname as table_name, rcl.relname as ref_table,
    array(select a.attname::text from unnest(con.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.o) as cols,
    array(select a.attname::text from unnest(con.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.o) as ref_cols,
    exists (
      select 1 from pg_constraint u
      where u.conrelid = con.conrelid and u.contype in ('p', 'u')
        and (select array_agg(x order by x) from unnest(u.conkey) x) = (select array_agg(x order by x) from unnest(con.conkey) x)
    ) as one_to_one
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_class rcl on rcl.oid = con.confrelid
  join pg_namespace n on n.oid = cl.relnamespace
  join pg_namespace rn on rn.oid = rcl.relnamespace
  where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
  order by cl.relname, con.conname`);

const functions = await q(`
  select p.proname as name, p.proretset as returns_set,
    pg_get_function_result(p.oid) as result,
    coalesce(p.proargnames, '{}') as arg_names,
    coalesce(array(select format_type(t, null) from unnest(p.proargtypes) t), '{}') as arg_types,
    coalesce(array(select t::regtype::text from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) t), '{}') as all_types,
    coalesce(p.proargmodes::text[], '{}') as modes,
    p.pronargdefaults as n_defaults,
    p.pronargs as n_args,
    rt.typname as ret_typname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and p.prokind = 'f'
    and rt.typname <> 'trigger'
  order by p.proname`);

const typeNameToUdt = (t) => {
  const map = {
    uuid: "uuid", text: "text", integer: "int4", bigint: "int8", numeric: "numeric", boolean: "bool",
    "timestamp with time zone": "timestamptz", jsonb: "jsonb", "uuid[]": "_uuid", "text[]": "_text", void: "void",
  };
  if (map[t]) return map[t];
  const bare = t.replace(/^public\./, "").replace(/\[\]$/, "");
  return t.endsWith("[]") ? `_${bare}` : bare;
};

// Function parameters / result columns that may legitimately be NULL.
// (Postgres does not record nullability for function signatures.)
const NULLABLE_ARGS = new Set(["p_selected_option_id", "p_text_answer", "p_part_id", "p_feedback", "p_note", "save_question.p_question_id"]);
const NULLABLE_RESULTS = {
  get_exam_overview: ["open_attempt_id"],
  get_released_answer_keys: ["correct_option_id", "explanation", "model_answer"],
  redeem_course_invite: ["course_id", "course_title"],
  save_answer: ["saved_at", "revision"],
};

const tables = {};
for (const c of columns) (tables[c.table_name] ??= []).push(c);

let out = `// Generated by scripts/gen-db-types.mjs — do not edit by hand.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
`;
for (const [name, cols] of Object.entries(tables)) {
  const row = cols.map((c) => `          ${c.column_name}: ${tsType(c.udt_name)}${c.nullable ? " | null" : ""};`).join("\n");
  const ins = cols
    .filter((c) => !c.generated)
    .map((c) => `          ${c.column_name}${c.nullable || c.has_default ? "?" : ""}: ${tsType(c.udt_name)}${c.nullable ? " | null" : ""};`)
    .join("\n");
  const upd = cols
    .filter((c) => !c.generated)
    .map((c) => `          ${c.column_name}?: ${tsType(c.udt_name)}${c.nullable ? " | null" : ""};`)
    .join("\n");
  const rels = fks
    .filter((f) => f.table_name === name)
    .map(
      (f) => `          {
            foreignKeyName: "${f.conname}";
            columns: [${f.cols.map((c) => `"${c}"`).join(", ")}];
            isOneToOne: ${f.one_to_one};
            referencedRelation: "${f.ref_table}";
            referencedColumns: [${f.ref_cols.map((c) => `"${c}"`).join(", ")}];
          },`,
    )
    .join("\n");
  out += `      ${name}: {
        Row: {
${row}
        };
        Insert: {
${ins}
        };
        Update: {
${upd}
        };
        Relationships: [
${rels}
        ];
      };
`;
}
out += `    };
    Views: {
${Object.entries(views)
  .map(([name, cols]) => `      ${name}: {
        Row: {
${cols.map((c) => `          ${c.column_name}: ${tsType(c.udt_name)} | null;`).join("\n")}
        };
        Relationships: [];
      };`)
  .join("\n")}
    };
    Functions: {
`;
for (const f of functions) {
  const inNames = [];
  const outCols = [];
  const modes = f.modes.length ? f.modes : f.arg_names.map(() => "i");
  f.arg_names.forEach((n, i) => {
    const mode = modes[i] ?? "i";
    const t = typeNameToUdt(f.all_types[i]);
    if (mode === "i" || mode === "b") inNames.push([n, t]);
    if (mode === "t" || mode === "o" || mode === "b") outCols.push([n, t]);
  });
  const firstDefault = f.n_args - f.n_defaults;
  const args = inNames.length
    ? `{ ${inNames.map(([n, t], i) => `${n}${i >= firstDefault ? "?" : ""}: ${tsType(t)}${NULLABLE_ARGS.has(n) || NULLABLE_ARGS.has(`${f.name}.${n}`) ? " | null" : ""}`).join("; ")} }`
    : "Record<PropertyKey, never>";
  let ret;
  if (outCols.length) ret = `{ ${outCols.map(([n, t]) => `${n}: ${tsType(t)}${NULLABLE_RESULTS[f.name]?.includes(n) ? " | null" : ""}`).join("; ")} }[]`;
  else ret = tsType(typeNameToUdt(f.result.replace(/^SETOF /, ""))) + (f.returns_set ? "[]" : "");
  out += `      ${f.name}: { Args: ${args}; Returns: ${ret} };\n`;
}
out += `    };
    Enums: {
${enums.map((e) => `      ${e.name}: ${e.labels.map((l) => `"${l}"`).join(" | ")};`).join("\n")}
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
`;

writeFileSync(new URL("../src/types/database.ts", import.meta.url), out);
await client.end();
console.log(`Wrote src/types/database.ts (${Object.keys(tables).length} tables, ${functions.length} functions)`);
