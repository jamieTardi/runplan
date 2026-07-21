// Flat config. Kept minimal; type safety is enforced by `tsc` via `next build`.
export default [
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", ".pglite/**", "next-env.d.ts"],
  },
];
