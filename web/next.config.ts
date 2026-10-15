import type { NextConfig } from "next";
import { join } from "node:path";

// The repo root, so `../src` and `../assets` get compiled and bundled.
const repoRoot = join(__dirname, "..");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
