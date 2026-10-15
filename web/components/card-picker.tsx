"use client";

import { useState } from "react";

const LAYOUTS = [
  { id: "wide", label: "Wide", size: "1200×630" },
  { id: "square", label: "Square", size: "1080×1080" },
  { id: "story", label: "Story", size: "1080×1920" },
];

// Same accents as src/card.ts. "auto" is whatever the score picked.
const THEMES: { id: string; color: string }[] = [
  { id: "auto", color: "var(--score)" },
  { id: "green", color: "#5ccf8a" },
  { id: "yellow", color: "#f2b134" },
  { id: "red", color: "#ff5c39" },
  { id: "orange", color: "#ff8a3d" },
  { id: "violet", color: "#a78bfa" },
  { id: "blue", color: "#5aa9ff" },
  { id: "magenta", color: "#f472d0" },
];

function cardUrl(target: string, layout: string, theme: string, download = false): string {
  const query = new URLSearchParams({ target, layout, theme });
  if (download) query.set("download", "1");
  return `/api/card?${query}`;
}

export function CardPicker({ target }: { target: string }) {
  const [theme, setTheme] = useState("auto");

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated PNG, not a static asset */}
      <img
        src={cardUrl(target, "wide", theme)}
        alt={`deeplarp card for ${target}`}
        width={1200}
        height={630}
        className="h-auto w-full rounded-lg border border-rule bg-panel"
      />

      <fieldset className="mt-5">
        <legend className="mb-3 text-sm text-muted">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <label key={t.id} className="relative cursor-pointer" title={t.id}>
              <input
                type="radio"
                name="theme"
                value={t.id}
                checked={theme === t.id}
                onChange={() => setTheme(t.id)}
                className="peer sr-only"
              />
              <span
                className="flex h-7 min-w-7 items-center justify-center rounded-md border-2 border-transparent px-1.5 text-xs text-ink ring-offset-2 ring-offset-ink peer-checked:border-paper peer-focus-visible:ring-2 peer-focus-visible:ring-muted"
                style={{ background: t.color }}
              >
                {/* "auto" is the score's own colour, so it gets a visible name. */}
                {t.id === "auto" ? "auto" : <span className="sr-only">{t.id}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {LAYOUTS.map((l) => (
          <a
            key={l.id}
            href={cardUrl(target, l.id, theme, true)}
            download
            className="text-paper underline decoration-rule underline-offset-4 hover:decoration-score focus-visible:decoration-score"
          >
            Download {l.label.toLowerCase()} <span className="text-dim">{l.size}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
