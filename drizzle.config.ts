import type { Config } from "drizzle-kit";

// We author the schema for Postgres. Locally the generated SQL is applied to an
// embedded PGlite instance; in production it targets a real Postgres server.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
} satisfies Config;
