#!/usr/bin/env node
// deeplarp CLI: argument parsing and terminal output. All the logic lives in report.ts.

import { parseArgs } from "node:util";
import { realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan, TOP_BY_STARS, type Report } from "./report";
import { renderCard, renderSvg, paletteFromToml, LAYOUTS, THEMES, type CardOptions, type Layout } from "./card";
import { DEFAULT_MODEL } from "./llm";

const USAGE = `usage: deeplarp [user | owner/repo] [options]

  no target       scan your own profile (the gh login), with a fix list and a card
  user            scan a profile: pinned repos + top ${TOP_BY_STARS} by stars
  owner/repo      scan one repo

options:
  --json          print the full report as JSON
  --no-llm        skip the claude -p pass. Same score, regex claims, template quip
  --model <m>     model for the claude -p pass: haiku, sonnet, opus or a full id
                  (default: ${DEFAULT_MODEL})
  --repos <n>     profiles: scan the top n repos by stars    (default: ${TOP_BY_STARS})
  --all           profiles: scan every non-fork repo (slow, ~5 api calls per repo)
  --fresh         ignore the 24h cache
  -h, --help      show this help

card (on by default for yourself; any card option turns it on for others):
  --card [file]   write a card to file.png or file.svg
                  (default: ./deeplarp-<target>-<layout>.<ext>)
  --layout <l>    ${LAYOUTS.join(" | ")}                      (default: wide)
  --theme <t>     ${THEMES.join(" | ")}
                  (default: auto, picked by the score)
  --palette <f>   card colours from a swatch-style palette.toml ([roles]);
                  its accent wins over --theme
  --format <f>    png | svg | both                            (default: png)
  --handle <name> name on the card (default: the target)`;

const FORMATS = ["png", "svg", "both"];

// `--card` takes an optional path, which parseArgs can't express. Rewrite a bare
// `--card` into `--card=` before parsing; the empty string means "default path".
export function normaliseArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === "--card") {
      if (next !== undefined && (next.endsWith(".png") || next.endsWith(".svg"))) {
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

// Every file to write for one card: one per format, sharing the base name.
export function cardPaths(cardArg: string, target: string, layout: Layout, format: string): string[] {
  const base = cardArg ? cardArg.replace(/\.(png|svg)$/, "") : `deeplarp-${target.replace("/", "_")}-${layout}`;
  const exts = format === "both" ? ["png", "svg"] : [format];
  return exts.map((ext) => `${base}.${ext}`);
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
    if (report.fixes.length === 0) lines.push(dim("    nothing left to fix"));
    for (const fix of report.fixes) lines.push(`    ${String(-fix.points).padStart(4)}  ${fix.text}`);
  } else {
    lines.push(`  ${report.quip}`);
  }
  lines.push("");

  const repos = report.kind === "profile" ? `${report.reposScanned.length} repos` : "1 repo";
  const calls = report.apiCalls === 0 ? "cached" : `${report.apiCalls} api call${report.apiCalls === 1 ? "" : "s"}`;
  const narrator = report.model ? `${report.model} narrated` : "no llm";
  lines.push(dim(`  ${repos} · ${calls} · ${narrator}`));
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: normaliseArgs(process.argv.slice(2)),
    options: {
      json: { type: "boolean", default: false },
      card: { type: "string" },
      "no-llm": { type: "boolean", default: false },
      model: { type: "string", default: DEFAULT_MODEL },
      layout: { type: "string" },
      theme: { type: "string" },
      palette: { type: "string" },
      format: { type: "string" },
      handle: { type: "string" },
      repos: { type: "string" },
      all: { type: "boolean", default: false },
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

  // Check card options before the scan, so a typo doesn't cost a full scan.
  const layout = (values.layout ?? "wide") as Layout;
  const format = values.format ?? "png";
  const theme = values.theme ?? "auto";
  if (!LAYOUTS.includes(layout)) throw new Error(`Unknown layout "${layout}". Pick one of: ${LAYOUTS.join(", ")}`);
  if (!FORMATS.includes(format)) throw new Error(`Unknown format "${format}". Pick one of: ${FORMATS.join(", ")}`);
  if (!THEMES.includes(theme)) throw new Error(`Unknown theme "${theme}". Pick one of: ${THEMES.join(", ")}`);
  const palette = values.palette === undefined ? undefined : paletteFromToml(values.palette);
  const cardOptions: CardOptions = { layout, theme, handle: values.handle, palette };
  const cardFlagUsed = [values.card, values.layout, values.theme, values.palette, values.format, values.handle].some((v) => v !== undefined);

  let repoLimit = TOP_BY_STARS;
  if (values.repos !== undefined) {
    repoLimit = Number(values.repos);
    if (!Number.isInteger(repoLimit) || repoLimit < 1) throw new Error(`--repos needs a whole number above 0, got "${values.repos}"`);
  }
  if (values.all) repoLimit = Infinity;

  const report = await scan(positionals[0] ?? null, { fresh: values.fresh, llm: !values["no-llm"], model: values.model, repos: repoLimit });

  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report));

  // Card: opt-in for other people, on by default for yourself (except in --json mode).
  const wantCard = cardFlagUsed || (report.self && !values.json);
  if (!wantCard) return;
  for (const path of cardPaths(values.card ?? "", report.target, layout, format)) {
    if (path.endsWith(".svg")) writeFileSync(path, await renderSvg(report, cardOptions));
    else writeFileSync(path, await renderCard(report, cardOptions));
    // stderr keeps stdout clean JSON in --json mode.
    console.error(dim(`  card written to ${path}`));
  }
}

// Only run when executed, not when the tests import this file. realpath follows the
// node_modules/.bin symlink that npx and global installs run through.
function isEntryPoint(): boolean {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) {
  try {
    await main();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
