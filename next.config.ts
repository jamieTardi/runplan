import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build and pdfkit reads font files at runtime — keep both
  // out of the server bundle so they load from node_modules as-is.
  serverExternalPackages: ["@electric-sql/pglite", "pdfkit"],
};

export default nextConfig;
