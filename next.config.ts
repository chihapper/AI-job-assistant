import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is per-user dynamic data everywhere, so it uses the classic
  // dynamic-by-default rendering model rather than Cache Components.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Native or WASM-backed packages are loaded from node_modules at runtime.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "postgres",
    "jsdom",
    "@react-pdf/renderer",
    "unpdf",
  ],
  // Migrations are read from disk at runtime, so include them in serverless bundles.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
