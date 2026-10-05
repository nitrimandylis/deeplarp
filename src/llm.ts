// Optional `claude -p` layer: pulls claims out of the bio/READMEs and rewrites the quip.
// It never touches the score. Any failure returns null and the caller keeps the regex version.

import type { Score } from "./score";

export type Story = { claims: string[]; quip: string };

const MAX_SOURCE_CHARS = 2500; // per bio/description/README
const MAX_PROMPT_CHARS = 10000;
const TIMEOUT_MS = 90_000;

export function buildPrompt(input: { target: string; claimSources: string[]; score: Score; quip: string }): string {
  const sources = input.claimSources
    .filter((text) => text.trim().length > 0)
    .map((text) => text.slice(0, MAX_SOURCE_CHARS))
    .join("\n---\n")
    .slice(0, MAX_PROMPT_CHARS);
  const receipts = input.score.signals.flatMap((s) => s.receipts).join("\n");

  return `You narrate a GitHub "larp score" report for ${input.target}. The score is already final: ${input.score.score ?? "none"}/100, archetype "${input.score.archetype}".

Receipts (facts the code check found):
${receipts || "(none)"}

Current one-line roast: ${input.quip}

Bio, descriptions and READMEs:
${sources}

Return ONLY a JSON object, no prose, no code fence:
{"claims": [up to 5 short quoted phrases the author claims about their work, copied from the text above], "quip": "one deadpan line, under 120 characters"}

Rules for the quip: dry and specific, built only on the receipts. No verdict on intent or honesty, no insults about the person, no emoji, no em dashes. If there are no receipts, the quip is gentle.`;
}

export function parseStory(output: string): Story | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const json = JSON.parse(output.slice(start, end + 1));
    if (!Array.isArray(json.claims) || typeof json.quip !== "string" || json.quip.trim() === "") return null;
    const claims = json.claims.filter((c: unknown) => typeof c === "string").slice(0, 5);
    return { claims, quip: json.quip.trim() };
  } catch {
    return null;
  }
}

export function narrate(input: { target: string; claimSources: string[]; score: Score; quip: string }): Story | null {
  if (!Bun.which("claude")) return null;

  const result = Bun.spawnSync(["claude", "-p", "--model", "haiku"], {
    stdin: Buffer.from(buildPrompt(input)),
    timeout: TIMEOUT_MS,
  });
  if (result.exitCode !== 0) return null;
  return parseStory(result.stdout.toString());
}
