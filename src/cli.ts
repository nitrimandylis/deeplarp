#!/usr/bin/env bun
// Milestone 2: fetch one repo and print the signals that fired. Scoring comes next.

import { parseArgs } from "node:util";
import { fetchRepo, apiCalls } from "./gh";
import { scanRepo, logicLines, wordCount } from "./scan";

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

  console.log(`${repo.fullName}  ${repo.isFork ? "(fork)" : ""}`);
  console.log(`  files      ${repo.files.length}${repo.treeTruncated ? " (tree truncated)" : ""}`);
  console.log(`  readme     ${wordCount(repo.readme)} words`);
  console.log(`  code       about ${logicLines(repo)} lines`);
  console.log(`  languages  ${Object.keys(repo.languages).join(", ") || "none"}`);
  console.log(`  commits    ${repo.commits.length} fetched`);
  console.log(`  manifests  ${Object.keys(repo.manifests).join(", ") || "none"}`);
  console.log(`  api calls  ${apiCalls}${apiCalls === 0 ? " (cached)" : ""}`);

  const signals = scanRepo(repo);
  console.log(signals.length === 0 ? "\n  no signals" : "");
  for (const s of signals) {
    console.log(`  [${s.id}] ${s.tier.padEnd(12)} ${s.receipt}`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
