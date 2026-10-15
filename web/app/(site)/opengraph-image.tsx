// Link preview for the home and about pages. Report pages set their own card.
// Built from the share card's tokens so a shared homepage link looks like the brand.

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "deeplarp: zero larp tolerance. A 0-100 larp score for any GitHub profile or repo.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SCALE = [
  { band: "0-19", label: "checks out", color: "#5ccf8a" },
  { band: "20-74", label: "some larp", color: "#f2b134" },
  { band: "75+", label: "deep larp", color: "#ff5c39" },
];

export default async function OpengraphImage() {
  const assets = join(process.cwd(), "..", "assets");
  const [pixel, regular, bold] = await Promise.all([
    readFile(join(assets, "PressStart2P-Regular.ttf")),
    readFile(join(assets, "JetBrainsMono-Regular.ttf")),
    readFile(join(assets, "JetBrainsMono-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b0d12", color: "#e8e6e1", fontFamily: "JetBrains" }}>
        <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 28px", background: "#11141a", borderBottom: "1px solid #232733" }}>
          <div style={{ display: "flex", gap: 10, width: 120 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#1c2029" }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#1c2029" }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#5ccf8a" }} />
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center", fontSize: 20, color: "#8a8f98" }}>deeplarp</div>
          <div style={{ width: 120 }} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 72px", gap: 28 }}>
          <div style={{ display: "flex", gap: 16, fontSize: 30, color: "#8a8f98" }}>
            <span style={{ color: "#5ccf8a" }}>$</span>
            <span>npx deeplarp &lt;user&gt;</span>
          </div>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>Zero larp tolerance.</div>
          <div style={{ fontSize: 28, color: "#8a8f98", lineHeight: 1.4 }}>
            A GitHub profile&apos;s claims, checked against its code.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 72px 48px" }}>
          <div style={{ fontSize: 24 }}>deeplarp.nicktrim.com</div>
          <div style={{ display: "flex", gap: 36 }}>
            {SCALE.map((s) => (
              <div key={s.band} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 6, height: 30, borderRadius: 3, background: s.color }} />
                <span style={{ fontFamily: "PressStart", fontSize: 16, color: s.color }}>{s.band}</span>
                <span style={{ fontSize: 20, color: "#8a8f98" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "PressStart", data: pixel, weight: 400, style: "normal" },
        { name: "JetBrains", data: regular, weight: 400, style: "normal" },
        { name: "JetBrains", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
