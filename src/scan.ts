// Repo scanner: turns one RepoData into the signals that fired, each with a receipt.
// Pure functions only. Weights and the final score live in the scoring step.

import type { RepoData, ProfileData, Commit } from "./gh";

export type Group = "Wrapper" | "Tutorial" | "Farmer";

export type Signal = {
  id: string; // matches the signal table in PRODUCT.md: "1", "2", "4", "5", "7", "8", "P1", "P2"
  group: Group | "credit";
  tier: "suspicious" | "contradicted" | "credit";
  where: string; // repo full name, or the login for profile signals
  receipt: string;
  detail?: string; // the one fact a quip can quote, e.g. the SDK name or the claimed language
};

// --- shared helpers ---

const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".rb", ".php", ".scala", ".zig", ".ex",
  ".hs", ".ml", ".dart", ".lua", ".jl", ".vue", ".svelte",
];
const IGNORED_DIRS = ["node_modules/", "vendor/", "dist/", "build/", ".next/", "third_party/"];

// ponytail: bytes / 40 guesses the line count from tree sizes alone (no file contents).
// Swap for real line counts if calibration shows this misjudges minified or generated code.
const BYTES_PER_LINE = 40;

export function logicLines(repo: RepoData): number {
  let bytes = 0;
  for (const file of repo.files) {
    if (IGNORED_DIRS.some((dir) => file.path.includes(dir))) continue;
    if (file.path.includes(".min.")) continue;
    if (!CODE_EXTENSIONS.some((ext) => file.path.endsWith(ext))) continue;
    bytes += file.size;
  }
  return Math.round(bytes / BYTES_PER_LINE);
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function claimText(repo: RepoData): string {
  return (repo.description ?? "") + "\n" + repo.readme;
}

function hasFile(repo: RepoData, path: string): boolean {
  return repo.files.some((f) => f.path === path);
}

// --- signal 1: README words vs lines of logic ---

const README_MIN_WORDS = 400;
const README_RATIO = 1.5; // README words per line of logic

export function readmeVsLogic(repo: RepoData): Signal | null {
  const words = wordCount(repo.readme);
  const lines = logicLines(repo);
  if (words < README_MIN_WORDS) return null;
  if (lines === 0) return null; // docs-only repos (awesome lists, notes) don't claim to be code
  if (words < lines * README_RATIO) return null;

  return {
    id: "1",
    where: repo.fullName,
    group: "Tutorial",
    tier: "suspicious",
    receipt: `${words} README words for about ${lines} lines of code`,
  };
}

// --- signal 2: LLM wrapper ---

const LLM_SDKS_NPM = [
  "openai", "@anthropic-ai/sdk", "ai", "langchain", "@google/generative-ai", "@google/genai",
  "groq-sdk", "ollama", "replicate", "cohere-ai", "@mistralai/mistralai",
];
const LLM_SDKS_PY = [
  "openai", "anthropic", "langchain", "google-generativeai", "google-genai", "groq",
  "ollama", "llama-index", "litellm", "cohere", "mistralai",
];
// (?<!-) skips "cross-platform", "multi-agent" style compounds.
const BIG_CLAIM = /(?<!-)\b(AI[- ]powered|autonomous|agentic|agents?|engine|framework|intelligent|platform)\b/i;
// A repo that calls itself a wrapper is being honest about it.
const SELF_DECLARED_WRAPPER = /\b(wrapper|sdk|client library|api client|bindings|proxy)\b/i;
const SELF_DECLARED_CHARS = 1000;
const WRAPPER_MAX_LINES = 1500;

export function llmDependencies(repo: RepoData): string[] {
  const found: string[] = [];

  const pkg = repo.manifests["package.json"];
  if (pkg) {
    try {
      const json = JSON.parse(pkg);
      const deps = { ...json.dependencies, ...json.devDependencies };
      for (const name of Object.keys(deps)) {
        if (LLM_SDKS_NPM.includes(name) || name.startsWith("@ai-sdk/") || name.startsWith("@langchain/")) {
          found.push(name);
        }
      }
    } catch {
      // A broken package.json just means no npm deps to read.
    }
  }

  // ponytail: Python manifests are scanned line by line for a leading package name,
  // not parsed. Use a real TOML parser if pyproject false positives show up.
  const pyText = (repo.manifests["requirements.txt"] ?? "") + "\n" + (repo.manifests["pyproject.toml"] ?? "");
  for (const line of pyText.split("\n")) {
    const name = line.trim().replace(/^["']/, "").split(/[\s\[<>=~!;"',]/)[0]!.toLowerCase();
    if (LLM_SDKS_PY.includes(name) || name.startsWith("langchain-")) found.push(name);
  }

  return [...new Set(found)];
}

export function llmWrapper(repo: RepoData): Signal | null {
  const sdks = llmDependencies(repo);
  if (sdks.length === 0) return null;

  const claim = claimText(repo).match(BIG_CLAIM);
  if (!claim) return null;
  // Repo name counts too ("ai-special-sdk"). Dashes and underscores become spaces for \b.
  const name = repo.fullName.split("/")[1]!.replace(/[-_]/g, " ");
  if (SELF_DECLARED_WRAPPER.test(name + "\n" + claimText(repo).slice(0, SELF_DECLARED_CHARS))) return null;

  const lines = logicLines(repo);
  if (lines > WRAPPER_MAX_LINES) return null;

  return {
    id: "2",
    where: repo.fullName,
    group: "Wrapper",
    tier: "contradicted",
    receipt: `claims "${claim[0]}", ships about ${lines} lines of code around ${sdks.join(", ")}`,
    detail: sdks[0],
  };
}

// --- signal 4: template fingerprint ---

const TEMPLATE_FILES = [
  "public/next.svg", "public/vercel.svg", "public/file.svg", "public/globe.svg", "public/window.svg",
  "public/vite.svg", "src/assets/react.svg",
  "src/logo.svg", "src/reportWebVitals.js", "src/setupTests.js",
];
const TEMPLATE_README = [
  "bootstrapped with [`create-next-app`]",
  "This template provides a minimal setup to get React working in Vite",
  "This project was bootstrapped with [Create React App]",
];
const TUTORIAL_NAME = /(todo|to-do|weather-?app|calculator|tic-?tac-?toe|-clone\b)/i;
const FROM_SCRATCH = /\b(from scratch|from the ground up)\b/i;

export function templateFingerprint(repo: RepoData): Signal | null {
  const marks: string[] = [];

  for (const path of TEMPLATE_FILES) {
    if (hasFile(repo, path)) marks.push(path);
  }
  const repoName = repo.fullName.split("/")[1]!;
  if (TUTORIAL_NAME.test(repoName)) marks.push(`tutorial name "${repoName}"`);

  const templateReadme = TEMPLATE_README.some((line) => repo.readme.includes(line));
  if (templateReadme) marks.push("untouched template README");

  // One stray default file is normal. Two marks, or the template README, is a fingerprint.
  if (!templateReadme && marks.length < 2) return null;

  const scratch = claimText(repo).match(FROM_SCRATCH);
  if (scratch) {
    return {
      id: "4",
      where: repo.fullName,
      group: "Tutorial",
      tier: "contradicted",
      receipt: `says "${scratch[0]}", still has ${marks.join(", ")}`,
    };
  }
  return {
    id: "4",
    where: repo.fullName,
    group: "Tutorial",
    tier: "suspicious",
    receipt: `template leftovers: ${marks.join(", ")}`,
  };
}

// --- signal 5: claimed stack vs GitHub language breakdown ---

// Claim word (lowercase) -> GitHub language names that satisfy it.
const LANGUAGES: Record<string, string[]> = {
  rust: ["Rust"], go: ["Go"], golang: ["Go"], "c++": ["C++"], "c#": ["C#"], c: ["C"],
  python: ["Python"], typescript: ["TypeScript", "JavaScript"], javascript: ["JavaScript", "TypeScript"],
  java: ["Java"], kotlin: ["Kotlin"], swift: ["Swift"], zig: ["Zig"], haskell: ["Haskell"],
  elixir: ["Elixir"], ruby: ["Ruby"], scala: ["Scala"], ocaml: ["OCaml"], julia: ["Julia"], dart: ["Dart"],
};
// The language word must end at whitespace or punctuation, so "c⁺⁺" isn't read as "c".
const STACK_CLAIM = /\b(?:built|written|made|implemented|coded)\s+(?:entirely\s+|purely\s+|from scratch\s+)?(?:in|with)\s+(?:pure\s+)?([A-Za-z]+[+#]*)(?=[\s.,;:!?)\]]|$)/gi;
const MIN_SHARE = 0.1;

export function claimedLanguages(text: string): string[] {
  const claims: string[] = [];
  for (const match of text.matchAll(STACK_CLAIM)) {
    const word = match[1]!.toLowerCase();
    if (LANGUAGES[word] && !claims.includes(word)) claims.push(word);
  }
  return claims;
}

export function stackMismatch(repo: RepoData): Signal | null {
  const total = Object.values(repo.languages).reduce((sum, bytes) => sum + bytes, 0);
  if (total === 0) return null;

  const claims = claimedLanguages(claimText(repo));
  if (claims.length === 0) return null;

  // Any claimed language that really is there clears the repo: a README that says
  // "written in Rust" and mentions an old C++ version isn't lying about Rust.
  const shares = claims.map((claim) => {
    let bytes = 0;
    for (const lang of LANGUAGES[claim]!) bytes += repo.languages[lang] ?? 0;
    return bytes / total;
  });
  if (shares.some((share) => share >= MIN_SHARE)) return null;

  const actual = Object.entries(repo.languages).sort((a, b) => b[1] - a[1])[0]![0];
  return {
    id: "5",
    where: repo.fullName,
    group: "Wrapper",
    tier: "contradicted",
    receipt: `claims ${claims[0]}, GitHub counts ${Math.round(shares[0]! * 100)}% (mostly ${actual})`,
    detail: claims[0],
  };
}

// --- P1: tests and CI ---

const TEST_FILE = /(\.test\.|\.spec\.|_test\.go$|(^|\/)test_[^/]+\.py$|(^|\/)(tests?|__tests__|spec)\/)/;
// Tests that scaffolding tools write for you (CRA, Angular CLI). They aren't evidence.
const TEMPLATE_TEST = /(^|\/)(App\.test\.[jt]sx?|setupTests\.[jt]s|app\.component\.spec\.ts)$/;
const MIN_TEST_FILES = 2;

// Credit needs real test files. CI alone is often just a Pages deploy, so it only
// shows up in the receipt next to tests.
export function testsAndCi(repo: RepoData): Signal | null {
  const tests = repo.files.filter(
    (f) => TEST_FILE.test(f.path) && !TEMPLATE_TEST.test(f.path) && !IGNORED_DIRS.some((d) => f.path.includes(d)),
  );
  if (tests.length < MIN_TEST_FILES) return null;

  const ci = repo.files.some((f) => f.path.startsWith(".github/workflows/"));
  const receipt = `${tests.length} test files` + (ci ? " and CI workflows" : "");
  return { id: "P1", group: "credit", tier: "credit", where: repo.fullName, receipt };
}

// --- entry point ---

export function scanRepo(repo: RepoData): Signal[] {
  const results = [readmeVsLogic(repo), llmWrapper(repo), templateFingerprint(repo), stackMismatch(repo), testsAndCi(repo)];
  return results.filter((s): s is Signal => s !== null);
}

// --- claims found without an LLM (shown in the report, never scored on their own) ---

export function regexClaims(text: string): string[] {
  const claims: string[] = [];
  const big = text.match(BIG_CLAIM);
  if (big) claims.push(big[0]);
  for (const lang of claimedLanguages(text)) claims.push(`written in ${lang}`);
  const scratch = text.match(FROM_SCRATCH);
  if (scratch) claims.push(scratch[0]);
  return claims;
}

// --- profile signals: 7, 8, P2 ---


// Real devs fork things to read or patch them. Padding is when empty forks are
// most of the profile.
const MIN_EMPTY_FORKS = 5;
const MIN_EMPTY_FORK_SHARE = 0.5;

// ponytail: a fork whose pushedAt is not after its createdAt never got a push of its own.
// Costs zero API calls. Use the compare API per fork if this misses forks synced from upstream.
export function forkPadding(profile: ProfileData): Signal | null {
  const empty = profile.repos.filter((r) => r.isFork && new Date(r.pushedAt) <= new Date(r.createdAt));
  if (empty.length < MIN_EMPTY_FORKS) return null;
  if (empty.length / profile.repos.length < MIN_EMPTY_FORK_SHARE) return null;

  return {
    id: "7",
    group: "Farmer",
    tier: "suspicious",
    where: profile.login,
    receipt: `${empty.length} of ${profile.repos.length} repos are forks with no commits of their own`,
    detail: String(empty.length),
  };
}

const REWRITE_DAYS = 30; // author date this far before the commit date = `git commit --date`
const PREHISTORIC_DAYS = 1; // commits this far before the repo was created
const BACKDATE_MIN_COMMITS = 5;
const BACKDATE_MIN_SHARE = 0.5; // of the repo's sampled commits by this user
const REPEAT_MIN_SHARE = 0.5; // of the backdated commits sharing a message or a clock time

function daysBetween(earlier: string, later: string): number {
  return (new Date(later).getTime() - new Date(earlier).getTime()) / 86_400_000;
}

// Share of the most common value in a list, plus that value.
export function topShare(values: string[]): { value: string; share: number } {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, share: values.length === 0 ? 0 : bestCount / values.length };
}

// Release commits ("-> v1.2.3") keep their digits: a run of version bumps isn't a script.
const VERSION = /\d+\.\d+\.\d+/;

function normaliseMessage(message: string): string {
  const lower = message.toLowerCase().trim();
  return VERSION.test(lower) ? lower : lower.replace(/\d+/g, "");
}

// Painting scripts reuse one message ("paint", "gitfiti", "commit 00862"), with digits
// stripped so numbered messages match, or commit every day at one clock time (23:00:00).
// Real history that was pushed late has neither.
export function looksScripted(commits: Commit[]): { message: string; scripted: boolean } {
  const messages = topShare(commits.map((c) => normaliseMessage(c.message)));
  const clockTimes = topShare(commits.map((c) => c.authorDate.slice(11, 19)));
  return {
    message: messages.value,
    scripted: messages.share >= REPEAT_MIN_SHARE || clockTimes.share >= REPEAT_MIN_SHARE,
  };
}

// Backdated = authored a month before it was committed (`git commit --date`), or dated
// before its repo existed (both dates set). Only scripted-looking runs count.
// Commits from before the repo existed contradict the graph outright; rewrites are suspicious.
export function backdatedCommits(profile: ProfileData): Signal | null {
  const painted: string[] = [];
  let total = 0;
  let prehistoric = false;
  let message = "";

  for (const repo of profile.repos) {
    if (repo.isFork) continue;
    const own = repo.commits.filter((c) => c.authorLogin?.toLowerCase() === profile.login.toLowerCase());
    const before = own.filter((c) => daysBetween(c.authorDate, repo.createdAt) >= PREHISTORIC_DAYS);
    const rewritten = own.filter((c) => daysBetween(c.authorDate, c.committerDate) >= REWRITE_DAYS);
    const backdated = own.filter((c) => before.includes(c) || rewritten.includes(c));

    if (backdated.length < BACKDATE_MIN_COMMITS) continue;
    if (backdated.length / own.length < BACKDATE_MIN_SHARE) continue;
    const pattern = looksScripted(backdated);
    if (!pattern.scripted) continue;

    painted.push(repo.fullName.split("/")[1]!);
    total += backdated.length;
    if (before.length >= BACKDATE_MIN_COMMITS) prehistoric = true;
    if (!message) message = pattern.message;
  }

  if (painted.length === 0) return null;
  const quoted = message === "" ? "an empty message" : `"${message}"`;
  const what = prehistoric ? "dated before their repo existed" : "with author dates a month or more before the commit";
  return {
    id: "8",
    group: "Farmer",
    tier: prehistoric ? "contradicted" : "suspicious",
    where: profile.login,
    receipt: `${total} scripted commits ${what} (mostly ${quoted}), in ${painted.join(", ")}`,
    detail: String(painted.length),
  };
}

export function mergedPrs(profile: ProfileData): Signal | null {
  if (profile.mergedPrsElsewhere === 0) return null;
  const n = profile.mergedPrsElsewhere;
  return {
    id: "P2",
    group: "credit",
    tier: "credit",
    where: profile.login,
    receipt: `${n} merged PR${n === 1 ? "" : "s"} into other people's repos`,
  };
}
