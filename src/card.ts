// Shareable card: satori lays out the elements as SVG, resvg rasterises it to PNG.
// Same approach and flags as agent-wrapped: --layout, --theme, --format, --handle.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Report } from "./report";

const ASSETS = join(import.meta.dir, "..", "assets");

export const LAYOUTS = ["wide", "square", "story"] as const;
export type Layout = (typeof LAYOUTS)[number];

// Size, text scale, and how many receipt lines fit. The wide card shows one line per
// signal; the taller ones list every repo a signal fired on and let text wrap.
const CANVASES: Record<Layout, { width: number; height: number; scale: number; lines: number; chars: number; everyRepo: boolean; stacked: boolean }> = {
  wide: { width: 1200, height: 630, scale: 1, lines: 4, chars: 70, everyRepo: false, stacked: false },
  square: { width: 1080, height: 1080, scale: 1.05, lines: 8, chars: 100, everyRepo: true, stacked: false },
  story: { width: 1080, height: 1920, scale: 1.35, lines: 9, chars: 100, everyRepo: true, stacked: true },
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

const COLORS = {
  base: "#101114",
  panel: "#181a1f",
  border: "#2a2d35",
  text: "#e8e6e1",
  muted: "#8a8f98",
  credit: "#5ccf8a",
};

export type CardOptions = { layout: Layout; theme: string; handle?: string };
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
  if (report.score === null || report.archetype === "Unproven") return COLORS.muted;
  if (report.score >= 75) return ACCENTS.red!;
  if (report.score >= 20) return ACCENTS.yellow!;
  return ACCENTS.green!;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

export function cardLayout(report: Report, options: CardOptions = DEFAULT_CARD): El {
  const canvas = CANVASES[options.layout];
  const px = (n: number) => Math.round(n * canvas.scale);
  const accent = accentFor(report, options.theme);

  const rows: { tier: string; text: string }[] = [];
  for (const s of report.signals) {
    const texts = canvas.everyRepo ? s.receipts : s.receipts.slice(0, 1);
    for (const text of texts) rows.push({ tier: s.tier, text });
  }
  // Leave the last line for "and N more" when it doesn't all fit.
  const shown = rows.length > canvas.lines ? rows.slice(0, canvas.lines - 1) : rows;
  const receipts = shown.map((row) =>
    el(
      { gap: px(12), fontSize: px(20), color: COLORS.text },
      el({ color: row.tier === "credit" ? COLORS.credit : accent, width: px(160), flexShrink: 0 }, row.tier),
      // "owner/repo: text" -> "repo: text" to save width. flex: 1 + wordBreak keeps
      // long repo names inside the panel instead of running off the edge.
      el({ flex: 1, wordBreak: "break-word" }, shorten(row.text.replace(/^[^/:]+\//, ""), canvas.chars)),
    ),
  );

  if (shown.length < rows.length) {
    receipts.push(el({ fontSize: px(20), color: COLORS.muted }, `and ${rows.length - shown.length} more`));
  }

  const scoreBlock = el(
    { alignItems: "flex-end", gap: px(12) },
    el({ fontFamily: "PressStart", fontSize: px(110), color: accent }, report.score === null ? "--" : String(report.score)),
    el({ fontSize: px(30), color: COLORS.muted, paddingBottom: px(6) }, "/100"),
  );
  const nameBlock = el(
    { flexDirection: "column", gap: px(6), paddingBottom: px(4) },
    el({ fontSize: px(44), fontWeight: 700 }, report.archetype),
    el({ fontSize: px(20), color: COLORS.muted }, report.capped ? "capped at 74: nothing contradicted" : "larp score"),
  );

  return el(
    {
      width: canvas.width,
      height: canvas.height,
      flexDirection: "column",
      backgroundColor: COLORS.base,
      fontFamily: "JetBrains",
      color: COLORS.text,
      padding: px(56),
      gap: px(28),
    },
    el(
      { justifyContent: "space-between", alignItems: "center", fontSize: px(24), color: COLORS.muted },
      el({}, "deeplarp"),
      el({}, options.handle ?? report.target),
    ),
    canvas.stacked
      ? el({ flexDirection: "column", gap: px(24), paddingTop: px(40) }, scoreBlock, nameBlock)
      : el({ alignItems: "flex-end", gap: px(40) }, scoreBlock, nameBlock),
    el(
      {
        flexDirection: "column",
        gap: px(14),
        backgroundColor: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: px(12),
        padding: `${px(22)}px ${px(26)}px`,
        flexGrow: 1,
        // Clip rather than push the roast line off the card if receipts run long.
        flexShrink: 1,
        minHeight: 0,
        overflow: "hidden",
      },
      ...(receipts.length > 0 ? receipts : [el({ fontSize: px(20), color: COLORS.muted }, "no receipts")]),
    ),
    el({ fontSize: px(24), color: COLORS.text }, report.quip),
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
