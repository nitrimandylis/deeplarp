#!/usr/bin/env bun
// deeplarp CLI: argument parsing and terminal output. All the logic lives in report.ts.

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { scan, type Report } from "./report";
import { renderCard } from "./card";

const USAGE = `usage: deeplarp [user | owner/repo] [options]

  no target       scan your own profile (the gh login), with a fix list and a card
  user            scan a profile: pinned repos + top 3 by stars, max 4
  owner/repo      scan one repo

options:
  --json          print the full report as JSON
  --card [path]   write a PNG card (default: deeplarp-<target>.png). On by default for yourself
  --no-llm        skip the claude -p pass. Same score, regex claims, template quip
  --fresh         ignore the 24h cache
  -h, --help      show this help`;

// `--card` takes an optional path, which parseArgs can't express. Rewrite a bare
// `--card` into `--card=` before parsing; the empty string means "default path".
export function normaliseArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === "--card") {
      if (next !== undefined && next.endsWith(".png")) {
        out.push(`--card=${next}`);
        i++;
      } else {
        out.push("--card=");
      }
    } else {
      out.push(arg);
    }
  }
  return out;
}

export function defaultCardPath(target: string): string {
  return `deeplarp-${target.replace("/", "_")}.png`;
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);

function signed(points: number): string {
  return (points > 0 ? "+" : "") + points;
}

export function formatReport(report: Report): string {
  const lines: string[] = [];
  const mode = report.self ? "  (you)" : "";
  lines.push(`${bold("deeplarp")}  ${report.target}${mode}`);
  lines.push("");

  if (report.score === null) {
    lines.push(`  ${bold("NPC")}  ${dim(`no score: ${report.npcReason}`)}`);
  } else {
    const color = report.score >= 75 ? red : report.score >= 20 ? yellow : green;
    lines.push(`  ${bold(color(`${report.score}/100`))}  ${bold(report.archetype)}`);
    if (report.capped) lines.push(dim("  capped at 74: suspicious signals only, nothing contradicted"));
  }
  lines.push("");

  if (report.claims.length > 0) {
    lines.push(`  ${bold("claims")}`);
    for (const claim of report.claims) lines.push(`    "${claim}"`);
    lines.push("");
  }

  lines.push(`  ${bold("receipts")}`);
  if (report.signals.length === 0) lines.push(dim("    none"));
  for (const s of report.signals) {
    const pts = signed(s.points).padStart(4);
    const tier = s.tier === "credit" ? green(s.tier.padEnd(12)) : s.tier === "contradicted" ? red(s.tier.padEnd(12)) : yellow(s.tier.padEnd(12));
    lines.push(`    ${pts}  ${tier} ${s.receipts[0]}`);
    for (const extra of s.receipts.slice(1)) lines.push(`                      ${extra}`);
  }
  lines.push("");

  if (report.self) {
    lines.push(`  ${bold("fix list")}  ${dim("(points off if fixed)")}`);
    for (const fix of report.fixes) lines.push(`    ${String(-fix.points).padStart(4)}  ${fix.text}`);
  } else {
    lines.push(`  ${report.quip}`);
  }
  lines.push("");

  const repos = report.kind === "profile" ? `${report.reposScanned.length} repos` : "1 repo";
  const calls = report.apiCalls === 0 ? "cached" : `${report.apiCalls} api call${report.apiCalls === 1 ? "" : "s"}`;
  const narrator = report.llm ? "claude narrated" : "no llm";
  lines.push(dim(`  ${repos} · ${calls} · ${narrator}`));
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: normaliseArgs(Bun.argv.slice(2)),
    options: {
      json: { type: "boolean", default: false },
      card: { type: "string" },
      "no-llm": { type: "boolean", default: false },
      fresh: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length > 1) {
    console.error(USAGE);
    process.exit(1);
  }

  const report = await scan(positionals[0] ?? null, { fresh: values.fresh, llm: !values["no-llm"] });

  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report));

  // Card: opt-in for other people, on by default for yourself (except in --json mode).
  const wantCard = values.card !== undefined || (report.self && !values.json);
  if (wantCard) {
    const path = values.card || defaultCardPath(report.target);
    writeFileSync(path, await renderCard(report));
    // Keep stdout clean JSON in --json mode.
    console.error(dim(`  card written to ${path}`));
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
