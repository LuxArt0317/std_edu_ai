/** Fixed, independent production release migration; never runs pending student migrations. */
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const version = "20261125020000";
const project = "xiftudmvxphxcjtmfmib";
if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production") {
  console.log(
    "Shared Answer Lab migration: skipped outside the production release build.",
  );
} else {
  let sql;
  try {
    const configuration = JSON.parse(await readFile("deployment.json", "utf8"));
    if (
      configuration.supabase.projectRef !== project ||
      configuration.repository !== "LuxArt0317/std_edu_ai"
    )
      throw new Error("Unexpected target");
    const connection =
      process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
    if (!connection)
      throw new Error("Production database connection unavailable");
    const target = new URL(connection);
    const direct = target.hostname === `db.${project}.supabase.co`;
    const pooler =
      target.hostname.endsWith(".supabase.com") &&
      decodeURIComponent(target.username).endsWith("." + project);
    if (
      !["postgres:", "postgresql:"].includes(target.protocol) ||
      (!direct && !pooler)
    )
      throw new Error("Unexpected database target");
    sql = postgres(connection, {
      max: 1,
      prepare: false,
      connect_timeout: 15,
      idle_timeout: 5,
      ssl: {
        rejectUnauthorized: true,
        ca: await readFile("supabase/certs/prod-ca-2021.crt", "utf8"),
      },
      onnotice: () => {},
    });
    const source = await readFile(
      `supabase/migrations/${version}_evaluation_lab_shared_admins.sql`,
      "utf8",
    );
    const outcome = await sql.begin(async (tx) => {
      await tx`set local lock_timeout='15s'`;
      await tx`set local statement_timeout='30s'`;
      await tx`select pg_advisory_xact_lock(hashtext('stu-client-migrations'))`;
      const existing =
        await tx`select version from supabase_migrations.schema_migrations where version=${version}`;
      if (existing.length) return "already applied";
      const prerequisites =
        await tx`select to_regclass('public.evaluation_lab_workspaces') is not null and to_regclass('public.evaluation_lab_attachments') is not null as ready`;
      if (!prerequisites[0]?.ready)
        throw new Error("Base lab migration required");
      const owners =
        await tx`select count(*)::int as count from auth.users u where lower(u.email)='luxart0317@gmail.com' and u.email_confirmed_at is not null`;
      if (owners[0].count !== 1)
        throw new Error("Verified shared workspace owner unavailable");
      await tx.unsafe(source);
      await tx`insert into supabase_migrations.schema_migrations(version,statements,name) values(${version},${[source]},'evaluation_lab_shared_admins')`;
      return "applied";
    });
    console.log(`Shared Answer Lab migration ${version}: ${outcome}.`);
  } catch (error) {
    console.error(
      "Shared Answer Lab production migration failed; release stopped.",
      {
        code:
          typeof error?.code === "string"
            ? error.code
            : "configuration-or-network",
      },
    );
    process.exitCode = 1;
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
}
