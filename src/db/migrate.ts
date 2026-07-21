// Standalone migration runner. Applies the SQL in ./drizzle to either the
// embedded PGlite database (default) or a real Postgres server (DATABASE_URL).
// Run with `pnpm db:migrate` while the dev server is stopped (PGlite allows a
// single connection to its data directory at a time).
import { readFileSync, existsSync } from "node:fs";

// Minimal .env loader (this script runs outside Next, which normally loads env).
function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  const migrationsFolder = "./drizzle";

  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder });
    await client.end();
    console.log("✓ Migrations applied to Postgres server.");
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = process.env.PGLITE_DIR ?? "./.pglite";
    const client = new PGlite(dataDir);
    await migrate(drizzle(client), { migrationsFolder });
    await client.close();
    console.log(`✓ Migrations applied to embedded PGlite (${dataDir}).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
