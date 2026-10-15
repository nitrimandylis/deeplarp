// The site icon: the prompt's green "$" in the card's pixel font, on the card's base.
// Shared by app/icon.tsx (favicon) and app/apple-icon.tsx (home screen).

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function renderIcon(size: number): Promise<ImageResponse> {
  const pixel = await readFile(join(process.cwd(), "..", "assets", "PressStart2P-Regular.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0d12",
          borderRadius: size * 0.2,
          color: "#5ccf8a",
          fontFamily: "PressStart",
          fontSize: size * 0.6,
          paddingLeft: size * 0.06,
        }}
      >
        $
      </div>
    ),
    { width: size, height: size, fonts: [{ name: "PressStart", data: pixel, weight: 400, style: "normal" }] },
  );
}
