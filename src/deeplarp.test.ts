// Offline tests: every function here runs on hand-built data, no network.
// Run with `bun test`.

import { test, expect } from "bun:test";
import { isFresh, type RepoData, type ProfileData, type ProfileRepo, type Commit } from "./gh";
import {
  scanRepo, logicLines, claimedLanguages, llmDependencies, regexClaims,
  forkPadding, backdatedCommits, looksScripted, mergedPrs, type Signal,
} from "./scan";
import { scoreSignals, archetypeFor, quipFor, fixesFor, SUSPICION_CAP } from "./score";
import { pickRepos, npcReason, type Report } from "./report";
import { parseStory, buildPrompt } from "./llm";
import { normaliseArgs, defaultCardPath, formatReport } from "./cli";
import { renderCard } from "./card";

function repo(overrides: Partial<RepoData> = {}): RepoData {
  return {
    version: 2,
    fullName: "someone/thing",
    description: "",
    isFork: false,
    stars: 0,
    defaultBranch: "main",
    createdAt: "2026-01-01T00:00:00Z",
    pushedAt: "2026-01-01T00:00:00Z",
    files: [{ path: "src/index.ts", size: 40_000 }], // about 1000 lines
    treeTruncated: false,
    readme: "",
    languages: { TypeScript: 40_000 },
    commits: [],
    manifests: {},
    fetchedAt: "2026-10-05T00:00:00Z",
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    version: 2,
    login: "someone",
    name: null,
    bio: null,
    createdAt: "2020-01-01T00:00:00Z",
    pinned: [],
    repos: [],
    mergedPrsElsewhere: 0,
    fetchedAt: "2026-10-05T00:00:00Z",
    ...overrides,
  };
}

function profileRepo(overrides: Partial<ProfileRepo> = {}): ProfileRepo {
  return { fullName: "someone/r", isFork: false, stars: 0, createdAt: "2026-01-01T00:00:00Z", pushedAt: "2026-01-01T00:00:00Z", commits: [], ...overrides };
}

function signal(id: string, tier: Signal["tier"], group: Signal["group"], where = "someone/thing"): Signal {
  return { id, tier, group, where, receipt: `signal ${id}`, detail: "x" };
}

const ids = (signals: Signal[]) => signals.map((s) => `${s.id}:${s.tier}`).join(",");

// --- gh ---

test("cache freshness is 24 hours", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  expect(isFresh("2026-10-05T00:00:00Z", now)).toBe(true);
  expect(isFresh("2026-10-04T11:00:00Z", now)).toBe(false);
});

// --- repo signals ---

test("logic lines skip node_modules, minified and non-code files", () => {
  const r = repo({
    files: [
      { path: "src/a.ts", size: 4000 },
      { path: "node_modules/x/index.js", size: 900_000 },
      { path: "public/app.min.js", size: 50_000 },
      { path: "logo.png", size: 80_000 },
    ],
  });
  expect(logicLines(r)).toBe(100);
});

test("a wrapper that claims everything fires 1, 2, 4 and 5", () => {
  const r = repo({
    fullName: "someone/todo-app",
    description: "An autonomous AI agent built from scratch in Rust",
    files: [{ path: "src/index.ts", size: 4000 }, { path: "public/next.svg", size: 1000 }],
    readme: "word ".repeat(500),
    languages: { TypeScript: 4000 },
    manifests: { "package.json": JSON.stringify({ dependencies: { openai: "^4", next: "15" } }) },
  });
  expect(ids(scanRepo(r))).toBe("1:suspicious,2:contradicted,4:contradicted,5:contradicted");
});

test("a docs-only repo doesn't trip the README ratio", () => {
  expect(scanRepo(repo({ files: [], readme: "word ".repeat(5000) }))).toEqual([]);
});

test("a big codebase using an LLM SDK is not a wrapper", () => {
  const r = repo({
    description: "Agent framework",
    files: [{ path: "src/index.ts", size: 400_000 }],
    manifests: { "package.json": JSON.stringify({ dependencies: { "@ai-sdk/openai": "1" } }) },
  });
  expect(scanRepo(r)).toEqual([]);
});

test("one template file alone is not a fingerprint, the template README is", () => {
  expect(scanRepo(repo({ files: [{ path: "public/vite.svg", size: 1 }] }))).toEqual([]);
  const r = repo({ readme: "This project was bootstrapped with [Create React App](https://x)." });
  expect(ids(scanRepo(r))).toBe("4:suspicious");
});

test("P1 needs 2 real test files; template tests and CI alone don't count", () => {
  const r = repo({ files: [{ path: "src/a.test.ts", size: 10 }, { path: "tests/b.py", size: 10 }, { path: ".github/workflows/ci.yml", size: 10 }] });
  expect(scanRepo(r)[0]!.receipt).toBe("2 test files and CI workflows");
  expect(scanRepo(repo({ files: [{ path: "src/App.test.js", size: 10 }, { path: "src/setupTests.js", size: 10 }] }))).toEqual([]);
  expect(scanRepo(repo({ files: [{ path: ".github/workflows/pages.yml", size: 10 }] }))).toEqual([]);
});

test("stack claims only count real languages", () => {
  expect(claimedLanguages("Written in pure C++ and built with React")).toEqual(["c++"]);
  expect(claimedLanguages("made with TypeScript")).toEqual(["typescript"]);
  expect(claimedLanguages("first written in c⁺⁺ [Angle]")).toEqual([]);
});

test("one real claimed language clears the repo", () => {
  expect(scanRepo(repo({ readme: "Written in Rust. The old version was written in C++.", languages: { Rust: 1000 } }))).toEqual([]);
});

test("JavaScript and TypeScript satisfy each other", () => {
  const r = repo({ readme: "Written in JavaScript", languages: { TypeScript: 1000 } });
  expect(scanRepo(r)).toEqual([]);
});

test("LLM SDKs are found in npm and Python manifests", () => {
  const py = repo({ manifests: { "requirements.txt": "openai>=1.0\nflask\nlangchain-core" } });
  expect(llmDependencies(py)).toEqual(["openai", "langchain-core"]);
  const toml = repo({ manifests: { "pyproject.toml": 'dependencies = [\n  "anthropic>=0.30",\n]' } });
  expect(llmDependencies(toml)).toEqual(["anthropic"]);
  expect(llmDependencies(repo({ manifests: { "package.json": "{broken" } }))).toEqual([]);
});

test("regex claims pick up big words, languages and from scratch", () => {
  expect(regexClaims("An AI-powered tool written in Rust from scratch")).toEqual(["AI-powered", "written in rust", "from scratch"]);
});

// --- profile signals ---

test("fork padding needs 5 empty forks making up half the profile", () => {
  const emptyFork = profileRepo({ isFork: true, createdAt: "2026-02-01T00:00:00Z", pushedAt: "2026-01-01T00:00:00Z" });
  const own = profileRepo();
  expect(forkPadding(profile({ repos: [...Array(4).fill(emptyFork), own] }))).toBeNull();
  expect(forkPadding(profile({ repos: [...Array(5).fill(emptyFork), ...Array(6).fill(own)] }))).toBeNull();
  expect(forkPadding(profile({ repos: [...Array(5).fill(emptyFork), ...Array(5).fill(own)] }))?.detail).toBe("5");
});

test("self-declared wrappers and cross-platform aren't wrapper claims", () => {
  const deps = { "package.json": JSON.stringify({ dependencies: { openai: "^4" } }) };
  expect(scanRepo(repo({ description: "Unified SDK for the AI engine of your choice", manifests: deps }))).toEqual([]);
  expect(scanRepo(repo({ description: "A cross-platform chat app", manifests: deps }))).toEqual([]);
  expect(scanRepo(repo({ fullName: "u/ai-special-sdk", description: "AI Platform", manifests: deps }))).toEqual([]);
  expect(ids(scanRepo(repo({ description: "An AI platform for chat", manifests: deps })))).toBe("2:contradicted");
});

test("scripted commits: repeated messages or one clock time, but not version bumps", () => {
  const c = (message: string, time: string): Commit =>
    ({ sha: "a", authorLogin: "someone", message, authorDate: `2024-01-01T${time}Z`, committerDate: `2024-01-01T${time}Z` });
  expect(looksScripted([c("Draw art 00862", "01:00:00"), c("Draw art 00863", "02:00:00")]).scripted).toBe(true);
  expect(looksScripted([c("Wed Sep 18", "23:00:00"), c("Thu Sep 19", "23:00:00")]).scripted).toBe(true);
  expect(looksScripted([c("-> v1.0.1", "01:00:00"), c("-> v1.0.2", "02:00:00"), c("-> v1.1.0", "03:00:00")]).scripted).toBe(false);
});

test("backdated commits: painted repos fire, old local history and rebases don't", () => {
  const at = (date: string, message: string, committed = date): Commit =>
    ({ sha: "a", authorLogin: "someone", message, authorDate: date, committerDate: committed });

  // Both dates set to 2024, repo created in 2026, one repeated message: a painted graph.
  const painted = profileRepo({ fullName: "someone/art", commits: Array(10).fill(at("2024-03-01T00:00:00Z", "paint")) });
  const signal8 = backdatedCommits(profile({ repos: [painted] }));
  expect(signal8?.tier).toBe("contradicted");
  expect(signal8?.receipt).toBe('10 scripted commits dated before their repo existed (mostly "paint"), in art');

  // `git commit --date` in a repo created first: author date a year before the commit date.
  const dated = profileRepo({ createdAt: "2024-01-01T00:00:00Z", commits: Array(6).fill(at("2025-01-01T00:00:00Z", "commit", "2026-02-01T00:00:00Z")) });
  expect(backdatedCommits(profile({ repos: [dated] }))?.tier).toBe("suspicious");

  // A real project pushed months after `git init`: old dates, varied messages.
  const times = ["09:12:01", "11:40:22", "14:03:59", "16:30:10", "18:45:33", "21:02:07"];
  const imported = profileRepo({ commits: ["init", "add parser", "fix tests", "docs", "refactor", "v1"].map((m, i) => at(`2025-06-0${i + 1}T${times[i]}Z`, m)) });
  expect(backdatedCommits(profile({ repos: [imported] }))).toBeNull();

  // Someone else's painted commits don't count.
  const notTheirs = profileRepo({ commits: Array(10).fill({ ...at("2024-03-01T00:00:00Z", "paint"), authorLogin: "other" }) });
  expect(backdatedCommits(profile({ repos: [notTheirs] }))).toBeNull();
});

test("merged PRs elsewhere give the P2 credit", () => {
  expect(mergedPrs(profile())).toBeNull();
  expect(mergedPrs(profile({ mergedPrsElsewhere: 1 }))?.receipt).toBe("1 merged PR into other people's repos");
});

// --- scoring ---

test("suspicion alone caps at 74", () => {
  const s = scoreSignals([signal("1", "suspicious", "Tutorial"), signal("4", "suspicious", "Tutorial"), signal("7", "suspicious", "Farmer"), signal("8", "suspicious", "Farmer"), signal("1", "suspicious", "Tutorial", "someone/b"), signal("4", "suspicious", "Tutorial", "someone/b")]);
  // 20 + 20 + 15 + 20 = 75, one over the cap
  expect(s.score).toBe(SUSPICION_CAP);
  expect(s.capped).toBe(true);
});

test("a contradicted signal lifts the cap", () => {
  const s = scoreSignals([signal("2", "contradicted", "Wrapper"), signal("5", "contradicted", "Wrapper"), signal("4", "suspicious", "Tutorial")]);
  expect(s.score).toBe(80);
  expect(s.capped).toBe(false);
});

test("repeats add 5 per extra repo, at most 2 extras, at the strongest tier", () => {
  const s = scoreSignals([
    signal("4", "suspicious", "Tutorial", "a/1"),
    signal("4", "contradicted", "Tutorial", "a/2"),
    signal("4", "suspicious", "Tutorial", "a/3"),
    signal("4", "suspicious", "Tutorial", "a/4"),
  ]);
  expect(s.signals[0]!.tier).toBe("contradicted");
  expect(s.signals[0]!.points).toBe(40);
  expect(s.signals[0]!.receipts.length).toBe(4);
});

test("credits are floored at -20 so they can't erase a contradiction", () => {
  const s = scoreSignals([signal("8", "contradicted", "Farmer"), signal("P1", "credit", "credit"), signal("P1", "credit", "credit", "a/2"), signal("P2", "credit", "credit")]);
  expect(s.score).toBe(20);
  expect(s.archetype).toBe("Contribution Farmer");
});

test("credits subtract and the score never goes below 0", () => {
  const s = scoreSignals([signal("P1", "credit", "credit"), signal("P2", "credit", "credit")]);
  expect(s.score).toBe(0);
  expect(s.archetype).toBe("Real One");
});

test("archetypes: single group, combo at 60%, Real One under 20", () => {
  expect(archetypeFor(50, { Wrapper: 50, Tutorial: 0, Farmer: 0 })).toBe("Wrapper Founder");
  expect(archetypeFor(50, { Wrapper: 50, Tutorial: 30, Farmer: 0 })).toBe("Prompt Engineer");
  expect(archetypeFor(50, { Wrapper: 50, Tutorial: 29, Farmer: 0 })).toBe("Wrapper Founder");
  expect(archetypeFor(50, { Wrapper: 20, Tutorial: 0, Farmer: 30 })).toBe("Hype Merchant");
  expect(archetypeFor(50, { Wrapper: 0, Tutorial: 30, Farmer: 30 })).toBe("Portfolio Speedrunner");
  expect(archetypeFor(50, { Wrapper: 0, Tutorial: 0, Farmer: 50 })).toBe("Contribution Farmer");
  expect(archetypeFor(19, { Wrapper: 35, Tutorial: 0, Farmer: 0 })).toBe("Real One");
});

test("NPCs get no score", () => {
  const s = scoreSignals([signal("2", "contradicted", "Wrapper")], true);
  expect(s.score).toBeNull();
  expect(s.archetype).toBe("NPC");
  expect(quipFor(s)).toBe("Not enough here to larp with yet.");
});

test("the most surprising quip wins", () => {
  const s = scoreSignals([signal("4", "suspicious", "Tutorial"), { ...signal("2", "contradicted", "Wrapper"), detail: "openai" }]);
  expect(quipFor(s)).toBe("An engine, in the sense that openai is the engine.");
});

test("fix list is ordered by points and includes missing credits", () => {
  const s = scoreSignals([signal("1", "suspicious", "Tutorial"), signal("2", "contradicted", "Wrapper")]);
  const fixes = fixesFor(s, "profile");
  expect(fixes.map((f) => f.points)).toEqual([35, 15, 15, 10]);
  expect(fixes[0]!.text).toContain("someone/thing");
  expect(fixesFor(s, "repo").some((f) => f.text.includes("PR merged"))).toBe(false);
});

// --- report ---

test("repo pick: pinned first, then top 3 by stars, no forks, max 4", () => {
  const r = (name: string, isFork = false) => profileRepo({ fullName: name, isFork });
  const p = profile({
    pinned: ["u/pin", "u/fork"],
    repos: [r("u/fork", true), r("u/a"), r("u/pin"), r("u/b"), r("u/c")],
  });
  expect(pickRepos(p)).toEqual(["u/pin", "u/a", "u/b", "u/c"]);
});

test("NPC: under 3 own repos or account under 30 days", () => {
  const r = (isFork: boolean) => profileRepo({ isFork });
  const now = new Date("2026-10-05T00:00:00Z");
  expect(npcReason(profile({ repos: [r(false), r(false), r(true)] }), now)).toBe("only 2 non-fork repos");
  expect(npcReason(profile({ repos: [r(false), r(false), r(false)], createdAt: "2026-09-25T00:00:00Z" }), now)).toBe("account is 10 days old");
  expect(npcReason(profile({ repos: [r(false), r(false), r(false)] }), now)).toBeNull();
});

// --- llm ---

test("story parsing takes the JSON out of chatty output and rejects junk", () => {
  expect(parseStory('Sure: {"claims": ["AI-powered"], "quip": "Fine."} done')).toEqual({ claims: ["AI-powered"], quip: "Fine." });
  expect(parseStory("no json here")).toBeNull();
  expect(parseStory('{"claims": "nope", "quip": "x"}')).toBeNull();
  expect(parseStory('{"claims": [], "quip": ""}')).toBeNull();
});

test("the prompt carries the final score and the receipts", () => {
  const s = scoreSignals([signal("2", "contradicted", "Wrapper")]);
  const prompt = buildPrompt({ target: "u/x", claimSources: ["bio text"], score: s, quip: "q" });
  expect(prompt).toContain("35/100");
  expect(prompt).toContain("someone/thing: signal 2");
  expect(prompt).toContain("bio text");
});

// --- cli + card ---

test("--card takes an optional .png path", () => {
  expect(normaliseArgs(["u", "--card"])).toEqual(["u", "--card="]);
  expect(normaliseArgs(["--card", "--json"])).toEqual(["--card=", "--json"]);
  expect(normaliseArgs(["--card", "out.png", "u"])).toEqual(["--card=out.png", "u"]);
  expect(normaliseArgs(["--card", "u"])).toEqual(["--card=", "u"]);
  expect(defaultCardPath("a/b")).toBe("deeplarp-a_b.png");
});

function fakeReport(self: boolean): Report {
  const s = scoreSignals([signal("4", "suspicious", "Tutorial"), signal("P1", "credit", "credit")]);
  return {
    ...s, target: "someone/thing", kind: "repo", self, quip: "the quip", fixes: fixesFor(s, "repo"),
    claims: ["from scratch"], reposScanned: ["someone/thing"], npcReason: null, llm: false, apiCalls: 0,
  };
}

test("terminal report: roast line for others, fix list for yourself", () => {
  const other = formatReport(fakeReport(false));
  expect(other).toContain("5/100");
  expect(other).toContain("the quip");
  expect(other).not.toContain("fix list");

  const mine = formatReport(fakeReport(true));
  expect(mine).toContain("fix list");
  expect(mine).toContain("(you)");
});

test("card renders a 1200x630 PNG", async () => {
  const png = await renderCard(fakeReport(false));
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});
