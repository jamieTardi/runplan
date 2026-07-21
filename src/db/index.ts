import "server-only";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Both drivers expose the same Drizzle query API against our schema; we type the
// export as the PGlite flavour (the local-dev default) and structurally reuse it
// for the postgres.js path.
export type Database = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __runplanDb?: Database };

function createDb(): Database {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Production / hosted Postgres.
    const client = postgres(url, { prepare: false });
    return drizzlePostgres(client, { schema }) as unknown as Database;
  }
  // Local dev: embedded Postgres (WASM) persisted to disk. No server needed.
  const dataDir = process.env.PGLITE_DIR ?? "./.pglite";
  const client = new PGlite(dataDir);
  return drizzlePglite(client, { schema });
}

function getDb(): Database {
  // Reuse a single instance across hot reloads so PGlite doesn't lock its data dir.
  if (!globalForDb.__runplanDb) globalForDb.__runplanDb = createDb();
  return globalForDb.__runplanDb;
}

// Lazy proxy: the underlying client is created on first query, never at import.
// This keeps `next build` from spinning up PGlite in every static-gen worker.
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
