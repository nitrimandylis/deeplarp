import type { NextConfig } from "next";
import { join } from "node:path";

// The repo root, so `../src` and `../assets` get compiled and bundled.
const repoRoot = join(__dirname, "..");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: repoRoot,
  // The card fonts are read at request time by /api/card, the icons and the OG image.
  outputFileTracingIncludes: { "/**": ["../assets/*.ttf"] },
  // Native binary, pulled in by ../src/card.ts (the web uses next/og instead).
  serverExternalPackages: ["@resvg/resvg-js", "satori"],
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
