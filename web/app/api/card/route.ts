// /api/card?target=&layout=&theme= serves the share card as a PNG. Also the OG image
// of every report page (wide layout).

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { cardLayout, cardSize, LAYOUTS, THEMES, type Layout } from "../../../../src/card";
import { parseTarget } from "@/lib/target";
import { loadReport } from "@/lib/report";

// The fonts live in the repo's assets/, one folder up from web/.
const ASSETS = join(process.cwd(), "..", "assets");

async function loadFonts() {
  const [pixel, regular, bold] = await Promise.all([
    readFile(join(ASSETS, "PressStart2P-Regular.ttf")),
    readFile(join(ASSETS, "JetBrainsMono-Regular.ttf")),
    readFile(join(ASSETS, "JetBrainsMono-Bold.ttf")),
  ]);
  return [
    { name: "PressStart", data: pixel, weight: 400 as const, style: "normal" as const },
    { name: "JetBrains", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "JetBrains", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = parseTarget(params.get("target") ?? "");
  if ("error" in parsed) return new Response(parsed.error, { status: 400 });

  const layout = (params.get("layout") ?? "wide") as Layout;
  if (!LAYOUTS.includes(layout)) return new Response(`layout is one of: ${LAYOUTS.join(", ")}`, { status: 400 });
  const theme = params.get("theme") ?? "auto";
  if (!THEMES.includes(theme)) return new Response(`theme is one of: ${THEMES.join(", ")}`, { status: 400 });

  const outcome = await loadReport(parsed.target.toLowerCase());
  if (outcome.kind === "missing") return new Response("No GitHub user or repo by that name.", { status: 404 });
  if (outcome.kind === "busy") return new Response(outcome.message, { status: 503 });
  if (outcome.kind === "broken") return new Response("Scanning is down: the site's GitHub token was refused.", { status: 503 });

  const { width, height } = cardSize(layout);
  const image = new ImageResponse(
    // satori's plain element objects have the same shape as React elements.
    cardLayout(outcome.scanned.report, { layout, theme }) as unknown as React.ReactElement,
    { width, height, fonts: await loadFonts() },
  );
  image.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  if (params.get("download")) {
    const name = parsed.target.replace("/", "-");
    image.headers.set("Content-Disposition", `attachment; filename="deeplarp-${name}-${layout}.png"`);
  }
  return image;
}
