#!/usr/bin/env bun
// Milestone 1: fetch one repo and print what was pulled. Scanners come next.

import { parseArgs } from "node:util";
import { fetchRepo, apiCalls } from "./gh";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    fresh: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const target = positionals[0];
if (!target || !target.includes("/")) {
  console.error("usage: deeplarp <owner/repo> [--fresh]");
  process.exit(1);
}

try {
  const repo = await fetchRepo(target, values.fresh);
  const readmeWords = repo.readme.split(/\s+/).filter((w) => w.length > 0).length;

  console.log(`${repo.fullName}  ${repo.isFork ? "(fork)" : ""}`);
  console.log(`  files      ${repo.files.length}${repo.treeTruncated ? " (tree truncated)" : ""}`);
  console.log(`  readme     ${readmeWords} words`);
  console.log(`  languages  ${Object.keys(repo.languages).join(", ") || "none"}`);
  console.log(`  commits    ${repo.commits.length} fetched`);
  console.log(`  api calls  ${apiCalls}${apiCalls === 0 ? " (cached)" : ""}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
