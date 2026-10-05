// Scoring: signals in, score + archetype + quip + fix list out. No LLM, no network.

import type { Group, Signal } from "./scan";

// Points per signal, by id and tier. Credits are negative.
const WEIGHTS: Record<string, number> = {
  "1:suspicious": 15,
  "2:contradicted": 35,
  "4:suspicious": 20,
  "4:contradicted": 30,
  "5:contradicted": 30,
  "7:suspicious": 15,
  "8:suspicious": 20,
  "8:contradicted": 40,
  "P1:credit": -10,
  "P2:credit": -15,
};

// The same signal on more repos adds a little, not the full weight again.
const EXTRA_PER_REPO = 5;
const MAX_EXTRAS = 2;

// Credits lower the score but can't launder a contradiction: tests in one repo don't
// undo a painted graph in another. Total credit is floored at this.
export const MAX_CREDIT = -20;

// Suspicion alone can't reach the top band. It needs at least one contradicted signal.
export const SUSPICION_CAP = 74;
export const REAL_ONE_BELOW = 20;
const COMBO_SHARE = 0.6;

export type ScoredSignal = {
  id: string;
  group: Group | "credit";
  tier: Signal["tier"];
  points: number;
  receipts: string[]; // "where: receipt", one per repo it fired on
  detail?: string;
};

export type Fix = { text: string; points: number };

export type Score = {
  score: number | null; // null for NPCs
  capped: boolean;
  archetype: string;
  groups: Record<Group, number>;
  signals: ScoredSignal[]; // biggest effect first
};

export function weightOf(signal: Signal): number {
  const weight = WEIGHTS[`${signal.id}:${signal.tier}`];
  if (weight === undefined) throw new Error(`No weight for signal ${signal.id}:${signal.tier}`);
  return weight;
}

// Collapses repeats of one signal id into a single entry at its strongest tier.
export function combine(signals: Signal[]): ScoredSignal[] {
  const byId = new Map<string, Signal[]>();
  for (const s of signals) {
    const list = byId.get(s.id) ?? [];
    list.push(s);
    byId.set(s.id, list);
  }

  const scored: ScoredSignal[] = [];
  for (const [id, list] of byId) {
    // Strongest = largest absolute weight (contradicted beats suspicious).
    let strongest = list[0]!;
    for (const s of list) {
      if (Math.abs(weightOf(s)) > Math.abs(weightOf(strongest))) strongest = s;
    }

    const base = weightOf(strongest);
    const extras = Math.min(list.length - 1, MAX_EXTRAS);
    const extra = extras * EXTRA_PER_REPO * Math.sign(base);

    scored.push({
      id,
      group: strongest.group,
      tier: strongest.tier,
      points: base + extra,
      receipts: list.map((s) => `${s.where}: ${s.receipt}`),
      detail: strongest.detail,
    });
  }

  scored.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return scored;
}

const COMBOS: Record<string, string> = {
  "Tutorial+Wrapper": "Prompt Engineer",
  "Farmer+Wrapper": "Hype Merchant",
  "Farmer+Tutorial": "Portfolio Speedrunner",
};
const SINGLES: Record<Group, string> = {
  Wrapper: "Wrapper Founder",
  Tutorial: "Tutorial Graduate",
  Farmer: "Contribution Farmer",
};

// A low score only earns "Real One" with positive evidence (tests or merged PRs).
// Without any, a low score just means there was nothing to check either way.
export function archetypeFor(score: number, groups: Record<Group, number>, hasCredit: boolean): string {
  if (score < REAL_ONE_BELOW) return hasCredit ? "Real One" : "Unproven";

  const ranked = (Object.keys(groups) as Group[]).sort((a, b) => groups[b] - groups[a]);
  const top = ranked[0]!;
  const second = ranked[1]!;
  if (groups[second] > 0 && groups[second] >= groups[top] * COMBO_SHARE) {
    const key = [top, second].sort().join("+");
    return COMBOS[key]!;
  }
  return SINGLES[top];
}

export function scoreSignals(signals: Signal[], npc = false): Score {
  const scored = combine(signals);
  const groups: Record<Group, number> = { Wrapper: 0, Tutorial: 0, Farmer: 0 };
  let total = 0;
  let credit = 0;
  for (const s of scored) {
    if (s.group === "credit") {
      credit += s.points;
    } else {
      total += s.points;
      groups[s.group] += s.points;
    }
  }
  total += Math.max(credit, MAX_CREDIT);

  if (npc) return { score: null, capped: false, archetype: "NPC", groups, signals: scored };

  let score = Math.max(0, Math.min(100, total));
  let capped = false;
  const contradicted = scored.some((s) => s.tier === "contradicted");
  if (!contradicted && score > SUSPICION_CAP) {
    score = SUSPICION_CAP;
    capped = true;
  }

  const hasCredit = scored.some((s) => s.tier === "credit");
  return { score, capped, archetype: archetypeFor(score, groups, hasCredit), groups, signals: scored };
}

// --- quips: first matching rule wins, most surprising first ---

type QuipRule = { when: (s: Score) => boolean; line: (s: Score) => string };

function find(s: Score, id: string): ScoredSignal | undefined {
  return s.signals.find((x) => x.id === id);
}

const QUIPS: QuipRule[] = [
  { when: (s) => s.archetype === "NPC", line: () => "Not enough here to larp with yet." },
  { when: (s) => s.archetype === "Real One", line: () => "The claims check out. Nothing to roast, which is the point." },
  { when: (s) => s.archetype === "Unproven", line: () => "Nothing contradicted, nothing proven. A blank page with a commit history." },
  {
    when: (s) => find(s, "5") !== undefined,
    line: (s) => `The README says ${find(s, "5")!.detail}. The code didn't get the memo.`,
  },
  {
    when: (s) => find(s, "2") !== undefined,
    line: (s) => `An engine, in the sense that ${find(s, "2")!.detail} is the engine.`,
  },
  {
    when: (s) => find(s, "4")?.tier === "contradicted",
    line: () => "Built from scratch, with the starter kit's logos still in public/.",
  },
  {
    when: (s) => find(s, "8") !== undefined,
    line: (s) =>
      find(s, "8")!.tier === "contradicted"
        ? "Commits from before the repo existed. Bold use of --date."
        : "Author dates a month older than the commits. Bold use of --date.",
  },
  {
    when: (s) => find(s, "7") !== undefined,
    line: (s) => `${find(s, "7")!.detail} forks, zero commits to any of them. A collector.`,
  },
  {
    when: (s) => find(s, "1") !== undefined,
    line: () => "The README is longer than the code. Documentation-driven development, minus the development.",
  },
  { when: (s) => find(s, "4") !== undefined, line: () => "create-next-app, followed by create-nothing-else." },
  { when: () => true, line: () => "Mostly fine. The receipts below are the whole story." },
];

export function quipFor(score: Score): string {
  for (const rule of QUIPS) {
    if (rule.when(score)) return rule.line(score);
  }
  return "";
}

// --- fix list (self mode): biggest score drop first ---

const FIXES: Record<string, string> = {
  "1": "Trim the README to what the code does, or ship the code it describes",
  "2": "Call it a wrapper in the README, or build the part that isn't the SDK",
  "4": "Delete the template leftovers and rewrite the template README",
  "5": "Make the stack claim match the language breakdown",
  "7": "Archive or delete forks you never committed to",
  "8": "Stop rewriting author dates. Real dates on fewer commits beat a painted graph",
};

export function fixesFor(score: Score, kind: "repo" | "profile"): Fix[] {
  const fixes: Fix[] = [];
  for (const s of score.signals) {
    if (s.tier === "credit") continue;
    const where = [...new Set(s.receipts.map((r) => r.split(":")[0]))].join(", ");
    fixes.push({ text: `${FIXES[s.id]} (${where})`, points: s.points });
  }

  // Missing credits are fixes too: they'd subtract points if they existed.
  if (!score.signals.some((s) => s.id === "P1")) {
    fixes.push({ text: "Add tests and a CI workflow", points: -WEIGHTS["P1:credit"]! });
  }
  if (kind === "profile" && !score.signals.some((s) => s.id === "P2")) {
    fixes.push({ text: "Get a PR merged into someone else's project", points: -WEIGHTS["P2:credit"]! });
  }

  fixes.sort((a, b) => b.points - a.points);
  return fixes;
}
