// Calibration: run the engine over hand-labelled profiles and count archetype matches.
// Bar from PRODUCT.md: at least 30 labelled profiles, at least 25 of 30 matching (83%).
// Public labels live in fixtures.json, private ones (friends, ambiguous) in fixtures.local.json.
//
// Run: bun run calibrate [--fresh]

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scan } from "./report";

type Fixture = { target: string; archetype: string; note: string };

const ROOT = join(import.meta.dir, "..");
const MIN_FIXTURES = 30;
const PASS_RATE = 25 / 30;

function load(file: string): Fixture[] {
  const path = join(ROOT, file);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
}

const fixtures = [...load("fixtures.json"), ...load("fixtures.local.json")];
const fresh = Bun.argv.includes("--fresh");

let matches = 0;
let errors = 0;
for (const fixture of fixtures) {
  // One at a time: 30 profiles in parallel would trip GitHub's secondary rate limits.
  try {
    const report = await scan(fixture.target, { fresh, llm: false });
    const ok = report.archetype === fixture.archetype;
    if (ok) matches++;
    const mark = ok ? "ok  " : "MISS";
    const score = report.score === null ? "--" : String(report.score);
    const got = ok ? "" : `  (got ${report.archetype})`;
    console.log(`${mark} ${fixture.target.padEnd(22)} ${score.padStart(3)}  ${fixture.archetype}${got}`);
    if (!ok) {
      for (const s of report.signals) console.log(`       ${String(s.points).padStart(4)} ${s.receipts[0]}`);
    }
  } catch (err) {
    errors++;
    console.log(`ERR  ${fixture.target.padEnd(22)} ${(err as Error).message}`);
  }
}

const rate = fixtures.length === 0 ? 0 : matches / fixtures.length;
console.log(`\n${matches}/${fixtures.length} match (${Math.round(rate * 100)}%), ${errors} errors`);

if (fixtures.length < MIN_FIXTURES) {
  console.log(`not enough labels: ${fixtures.length} of ${MIN_FIXTURES}`);
  process.exit(1);
}
if (rate < PASS_RATE) {
  console.log(`below the bar: need ${Math.round(PASS_RATE * 100)}%`);
  process.exit(1);
}
console.log("calibration passes");
