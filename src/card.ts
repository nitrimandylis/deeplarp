// Shareable card: satori lays out the elements as SVG, resvg rasterises it to PNG.
// Same approach and flags as agent-wrapped: --layout, --theme, --format, --handle.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Report } from "./report";

// One folder up from src/ in dev and from dist/ once bundled.
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

export const LAYOUTS = ["wide", "square", "story"] as const;
export type Layout = (typeof LAYOUTS)[number];

// Size, text scale, how many receipt lines fit, and whether the group breakdown
// panel fits. The wide card is a summary; the taller ones add the breakdown.
// The story card stacks the archetype under a bigger score to fill its height.
const CANVASES: Record<Layout, { width: number; height: number; scale: number; lines: number; breakdown: boolean; stacked: boolean; scoreSize: number }> = {
  wide: { width: 1200, height: 630, scale: 1, lines: 2, breakdown: false, stacked: false, scoreSize: 84 },
  square: { width: 1080, height: 1080, scale: 1.05, lines: 4, breakdown: true, stacked: false, scoreSize: 84 },
  story: { width: 1080, height: 1920, scale: 1.35, lines: 6, breakdown: true, stacked: true, scoreSize: 150 },
};

// Accent colours. "auto" picks one from the score: green for Real One, yellow for
// 20-74, red for 75+, grey for Unproven and NPC.
const ACCENTS: Record<string, string> = {
  green: "#5ccf8a",
  yellow: "#f2b134",
  red: "#ff5c39",
  orange: "#ff8a3d",
  violet: "#a78bfa",
  blue: "#5aa9ff",
  magenta: "#f472d0",
};
export const THEMES = ["auto", ...Object.keys(ACCENTS)];

const DEFAULT_COLORS = {
  base: "#0b0d12",
  bar: "#11141a",
  panel: "#11141a",
  border: "#232733",
  text: "#e8e6e1",
  muted: "#8a8f98",
  dim: "#5b606b",
  track: "#1c2029",
  credit: "#5ccf8a",
};
type Colors = typeof DEFAULT_COLORS;

// A custom palette from --palette: card colours to override, plus an optional accent
// that wins over --theme.
export type Palette = { colors: Partial<Colors>; accent?: string };

// Reads the [roles] section of a swatch-style palette.toml, the same format
// agent-wrapped takes. Only `key = "#hex"` lines are read; other sections are skipped.
export function paletteFromToml(path: string): Palette {
  const roles: Record<string, string> = {};
  let inRoles = false;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inRoles = line === "[roles]";
      continue;
    }
    if (!inRoles) continue;
    const match = line.match(/^(\w+)\s*=\s*"(#[0-9a-fA-F]{3,8})"/);
    if (match) roles[match[1]!] = match[2]!;
  }
  if (Object.keys(roles).length === 0) throw new Error(`${path}: no colours found under [roles]`);

  // One swatch role can fill several card slots. Missing roles keep the default.
  const colors: Partial<Colors> = {};
  if (roles.base) colors.base = roles.base;
  if (roles.surface) colors.bar = colors.panel = roles.surface;
  if (roles.overlay) colors.border = colors.track = roles.overlay;
  if (roles.text) colors.text = roles.text;
  if (roles.muted) colors.muted = colors.dim = roles.muted;
  return { colors, accent: roles.accent };
}

// Short names for the signal table in PRODUCT.md, used in the reason line.
const SIGNAL_NAMES: Record<string, string> = {
  "1": "readme padding",
  "2": "llm wrapper",
  "3": "empty claims",
  "4": "template leftovers",
  "5": "stack mismatch",
  "6": "big-bang commits",
  "7": "fork padding",
  "8": "backdated commits",
  P1: "tests + CI",
  P2: "merged PRs",
};

export type CardOptions = { layout: Layout; theme: string; handle?: string; palette?: Palette };
export const DEFAULT_CARD: CardOptions = { layout: "wide", theme: "auto" };

// Minimal element builder for satori (it wants React-shaped objects, not JSX).
type El = { type: string; props: { style: Record<string, unknown>; children?: unknown } };

function el(style: Record<string, unknown>, ...children: (El | string)[]): El {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

export function accentFor(report: Report, theme: string): string {
  if (theme !== "auto") {
    const accent = ACCENTS[theme];
    if (!accent) throw new Error(`Unknown theme "${theme}". Pick one of: ${THEMES.join(", ")}`);
    return accent;
  }
  if (report.score === null || report.archetype === "Unproven") return DEFAULT_COLORS.muted;
  if (report.score >= 75) return ACCENTS.red!;
  if (report.score >= 20) return ACCENTS.yellow!;
  return ACCENTS.green!;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

// The line under the archetype: what put the score there, biggest effect first.
export function reasonFor(report: Report): string {
  if (report.npcReason) return `no score: ${report.npcReason}`;
  const names: string[] = [];
  for (const s of report.signals) {
    const name = SIGNAL_NAMES[s.id] ?? s.id;
    if (!names.includes(name)) names.push(name);
  }
  if (names.length === 0) return "nothing fired";
  let reason = names.slice(0, 2).join(" + ");
  if (report.capped) reason += " · capped at 74";
  return reason;
}

// Receipts by tier, counted per repo (one signal on 3 repos is 3 receipts).
export function tierCounts(report: Report): Record<"contradicted" | "suspicious" | "credit", number> {
  const counts = { contradicted: 0, suspicious: 0, credit: 0 };
  for (const s of report.signals) counts[s.tier] += s.receipts.length;
  return counts;
}

// One bar per credit receipt: test files per repo, then merged PRs. The number is the
// one the receipt starts with ("aidetect: 33 test files and CI workflows").
export function creditBars(report: Report): { label: string; value: number; unit: string }[] {
  const bars: { label: string; value: number; unit: string }[] = [];
  for (const s of report.signals) {
    if (s.tier !== "credit") continue;
    for (const receipt of s.receipts) {
      const [where = "", text = ""] = receipt.split(": ");
      const value = parseInt(text, 10) || 0;
      if (s.id === "P2") bars.push({ label: "merged PRs", value, unit: value === 1 ? "PR" : "PRs" });
      else bars.push({ label: where.split("/").pop() ?? where, value, unit: "tests" });
    }
  }
  return bars;
}

export function cardLayout(report: Report, options: CardOptions = DEFAULT_CARD): El {
  const canvas = CANVASES[options.layout];
  const px = (n: number) => Math.round(n * canvas.scale);
  const COLORS = { ...DEFAULT_COLORS, ...options.palette?.colors };
  const accent = options.palette?.accent ?? accentFor(report, options.theme);
  const counts = tierCounts(report);
  const handle = options.handle ?? report.target;

  // Title bar and prompt line, so the card reads as terminal output.
  const dot = (color: string) => el({ width: px(12), height: px(12), borderRadius: px(6), backgroundColor: color });
  const titleBar = el(
    {
      alignItems: "center",
      height: px(44),
      padding: `0 ${px(20)}px`,
      backgroundColor: COLORS.bar,
      borderBottom: `1px solid ${COLORS.border}`,
      fontSize: px(16),
      color: COLORS.muted,
    },
    el({ gap: px(8), width: px(120) }, dot(COLORS.track), dot(COLORS.track), dot(accent)),
    el({ flex: 1, justifyContent: "center" }, `${handle} — deeplarp`),
    el({ width: px(120) }),
  );
  const promptLine = el(
    { justifyContent: "space-between", fontSize: px(18), color: COLORS.muted },
    el({ gap: px(10) }, el({ color: accent }, "$"), el({ color: COLORS.text }, `npx deeplarp ${report.target}`)),
    el({}, new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })),
  );

  // Score on the left, archetype and the reason for it on the right.
  const hero = el(
    canvas.stacked
      ? { flexDirection: "column", gap: px(28) }
      : { justifyContent: "space-between", alignItems: "flex-end" },
    el(
      { alignItems: "flex-end", gap: px(16) },
      el({ fontFamily: "PressStart", fontSize: px(canvas.scoreSize), color: accent, lineHeight: 1 }, report.score === null ? "--" : String(report.score)),
      el({ fontSize: px(26), color: COLORS.muted }, "/100"),
    ),
    el(
      { flexDirection: "column", alignItems: canvas.stacked ? "flex-start" : "flex-end", gap: px(6) },
      el({ fontSize: px(26), letterSpacing: px(4), color: COLORS.text }, report.archetype.toUpperCase()),
      el({ fontSize: px(17), color: COLORS.muted }, reasonFor(report)),
    ),
  );

  const quip = el({ fontSize: px(26), color: accent, lineHeight: 1.35 }, report.quip);

  // One "›" line per repo a signal fired on, biggest effect first. Credits get green.
  const rows: { tier: string; text: string }[] = [];
  for (const s of report.signals) {
    for (const text of s.receipts) rows.push({ tier: s.tier, text });
  }
  const shown = rows.slice(0, canvas.lines);
  const receipts = shown.map((row) =>
    el(
      { gap: px(12), fontSize: px(19), color: COLORS.muted, lineHeight: 1.4 },
      el({ color: row.tier === "credit" ? COLORS.credit : accent, flexShrink: 0 }, "›"),
      // "owner/repo: text" -> "repo: text" to save width.
      el({ flex: 1, wordBreak: "break-word" }, shorten(row.text.replace(/^[^/:]+\//, ""), 120)),
    ),
  );
  if (rows.length > shown.length) {
    receipts.push(el({ fontSize: px(17), color: COLORS.dim, paddingLeft: px(24) }, `+ ${rows.length - shown.length} more receipts`));
  }

  const tile = (value: string, label: string, color: string) =>
    el(
      {
        flex: 1,
        flexDirection: "column",
        gap: px(6),
        padding: `${px(16)}px ${px(18)}px`,
        backgroundColor: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: px(8),
      },
      el({ fontSize: px(34), color }, value),
      el({ fontSize: px(15), color: COLORS.muted }, label),
    );
  const tiles = el(
    { gap: px(14) },
    tile(String(report.reposScanned.length), "repos scanned", COLORS.text),
    tile(String(counts.contradicted), "contradicted", counts.contradicted > 0 ? accent : COLORS.text),
    tile(String(counts.suspicious), "suspicious", COLORS.text),
    tile(String(counts.credit), "credits", counts.credit > 0 ? COLORS.credit : COLORS.text),
  );

  // Bars on the taller cards: points per group, out of 100. When no group has points
  // (a clean profile), the panel shows what backs it up instead: one bar per credit.
  const barRow = (label: string, value: number, max: number, valueText: string, color: string) =>
    el(
      { alignItems: "center", gap: px(16), fontSize: px(16) },
      el({ width: px(130), color: COLORS.muted }, shorten(label, 14)),
      el(
        { flex: 1, height: px(10), borderRadius: px(5), backgroundColor: COLORS.track },
        el({ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", borderRadius: px(5), backgroundColor: color }),
      ),
      el({ width: px(90), justifyContent: "flex-end", color: value > 0 ? COLORS.text : COLORS.dim }, valueText),
    );
  const groupPoints = Object.entries(report.groups);
  const credits = creditBars(report)
    .sort((a, b) => b.value - a.value)
    .slice(0, canvas.lines);
  const showCredits = canvas.breakdown && groupPoints.every(([, points]) => points === 0) && credits.length > 0;
  const mostCredit = Math.max(1, ...credits.map((c) => c.value));
  const breakdown = el(
    {
      flexDirection: "column",
      gap: px(16),
      padding: `${px(18)}px ${px(20)}px`,
      backgroundColor: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: px(8),
    },
    el({ fontSize: px(15), color: COLORS.muted }, showCredits ? "what backs it up" : "where the points come from"),
    ...(showCredits
      ? credits.map((c) => barRow(c.label, c.value, mostCredit, `${c.value} ${c.unit}`, COLORS.credit))
      : groupPoints.map(([name, points]) => barRow(name.toLowerCase(), points, 100, `${points} pts`, accent))),
  );

  const body = el(
    { flexDirection: "column", flex: 1, justifyContent: "center", gap: px(22), padding: `0 ${px(28)}px` },
    hero,
    quip,
    // The credits panel already lists every credit receipt, so skip the text version.
    ...(showCredits
      ? []
      : [el({ flexDirection: "column", gap: px(4) }, ...(receipts.length > 0 ? receipts : [el({ fontSize: px(19), color: COLORS.dim }, "› no receipts")]))]),
    tiles,
    ...(canvas.breakdown ? [breakdown] : []),
  );

  return el(
    {
      width: canvas.width,
      height: canvas.height,
      flexDirection: "column",
      backgroundColor: COLORS.base,
      fontFamily: "JetBrains",
      color: COLORS.text,
    },
    titleBar,
    el({ padding: `${px(18)}px ${px(28)}px 0` }, el({ flex: 1, flexDirection: "column" }, promptLine)),
    body,
    el(
      { justifyContent: "center", padding: `${px(18)}px 0 ${px(22)}px`, fontSize: px(14), color: COLORS.dim },
      "receipts from public GitHub data · not a verdict on intent",
    ),
  );
}

let fontCache: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;

function loadFonts() {
  fontCache ??= [
    { name: "PressStart", data: readFileSync(join(ASSETS, "PressStart2P-Regular.ttf")), weight: 400, style: "normal" },
    { name: "JetBrains", data: readFileSync(join(ASSETS, "JetBrainsMono-Regular.ttf")), weight: 400, style: "normal" },
    { name: "JetBrains", data: readFileSync(join(ASSETS, "JetBrainsMono-Bold.ttf")), weight: 700, style: "normal" },
  ];
  return fontCache;
}

export async function renderSvg(report: Report, options: CardOptions = DEFAULT_CARD): Promise<string> {
  const { width, height } = CANVASES[options.layout];
  // satori's types expect a ReactNode; our plain objects have the same shape.
  return satori(cardLayout(report, options) as any, { width, height, fonts: loadFonts() });
}

export async function renderCard(report: Report, options: CardOptions = DEFAULT_CARD): Promise<Buffer> {
  const svg = await renderSvg(report, options);
  const { width } = CANVASES[options.layout];
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng());
}
