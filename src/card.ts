// Shareable PNG card: satori lays out the elements as SVG, resvg rasterises it.
// Same approach as agent-wrapped's renderer, cut down to one fixed layout.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Report } from "./report";

const WIDTH = 1200;
const HEIGHT = 630;
const ASSETS = join(import.meta.dir, "..", "assets");

const COLORS = {
  base: "#101114",
  panel: "#181a1f",
  border: "#2a2d35",
  text: "#e8e6e1",
  muted: "#8a8f98",
  hot: "#ff5c39", // larp score 75+
  warm: "#f2b134", // 20-74
  cool: "#5ccf8a", // Real One
};

// Minimal element builder for satori (it wants React-shaped objects, not JSX).
type El = { type: string; props: { style: Record<string, unknown>; children?: unknown } };

function el(style: Record<string, unknown>, ...children: (El | string)[]): El {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

function scoreColor(report: Report): string {
  if (report.score === null || report.archetype === "Unproven") return COLORS.muted;
  if (report.score >= 75) return COLORS.hot;
  if (report.score >= 20) return COLORS.warm;
  return COLORS.cool;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

export function cardLayout(report: Report): El {
  const receipts = report.signals.slice(0, 4).map((s) =>
    el(
      { gap: 12, fontSize: 20, color: COLORS.text },
      el({ color: s.tier === "credit" ? COLORS.cool : scoreColor(report), width: 160, flexShrink: 0 }, s.tier),
      // "owner/repo: text" -> "repo: text" to save width
      shorten(s.receipts[0]!.replace(/^[^/:]+\//, ""), 70),
    ),
  );

  return el(
    {
      width: WIDTH,
      height: HEIGHT,
      flexDirection: "column",
      backgroundColor: COLORS.base,
      fontFamily: "JetBrains",
      color: COLORS.text,
      padding: 56,
      gap: 28,
    },
    el(
      { justifyContent: "space-between", alignItems: "center", fontSize: 24, color: COLORS.muted },
      el({}, "deeplarp"),
      el({}, report.target),
    ),
    el(
      { alignItems: "flex-end", gap: 40 },
      el(
        { alignItems: "flex-end", gap: 12 },
        el({ fontFamily: "PressStart", fontSize: 110, color: scoreColor(report) }, report.score === null ? "--" : String(report.score)),
        el({ fontSize: 30, color: COLORS.muted, paddingBottom: 6 }, "/100"),
      ),
      el(
        { flexDirection: "column", gap: 6, paddingBottom: 4 },
        el({ fontSize: 44, fontWeight: 700 }, report.archetype),
        el({ fontSize: 20, color: COLORS.muted }, report.capped ? "capped at 74: nothing contradicted" : "larp score"),
      ),
    ),
    el(
      {
        flexDirection: "column",
        gap: 14,
        backgroundColor: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "22px 26px",
        flexGrow: 1,
      },
      ...(receipts.length > 0 ? receipts : [el({ fontSize: 20, color: COLORS.muted }, "no receipts")]),
    ),
    el({ fontSize: 24, color: COLORS.text }, shorten(report.quip, 95)),
  );
}

export async function renderCard(report: Report): Promise<Buffer> {
  const fonts = [
    { name: "PressStart", data: readFileSync(join(ASSETS, "PressStart2P-Regular.ttf")), weight: 400 as const, style: "normal" as const },
    { name: "JetBrains", data: readFileSync(join(ASSETS, "JetBrainsMono-Regular.ttf")), weight: 400 as const, style: "normal" as const },
    { name: "JetBrains", data: readFileSync(join(ASSETS, "JetBrainsMono-Bold.ttf")), weight: 700 as const, style: "normal" as const },
  ];
  // satori's types expect a ReactNode; our plain objects have the same shape.
  const svg = await satori(cardLayout(report) as any, { width: WIDTH, height: HEIGHT, fonts });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng());
}
