// Repo scanner: turns one RepoData into the signals that fired, each with a receipt.
// Pure functions only. Weights and the final score live in the scoring step.

import type { RepoData } from "./gh";

export type Signal = {
  id: string; // matches the signal table in PRODUCT.md: "1", "2", "4", "5", "P1"
  group: "Wrapper" | "Tutorial" | "Farmer" | "credit";
  tier: "suspicious" | "contradicted" | "credit";
  receipt: string;
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
  if (words < lines * README_RATIO) return null;

  return {
    id: "1",
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
const BIG_CLAIM = /\b(AI[- ]powered|autonomous|agentic|agents?|engine|framework|intelligent|platform)\b/i;
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

  const lines = logicLines(repo);
  if (lines > WRAPPER_MAX_LINES) return null;

  return {
    id: "2",
    group: "Wrapper",
    tier: "contradicted",
    receipt: `claims "${claim[0]}", ships about ${lines} lines of code around ${sdks.join(", ")}`,
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
      group: "Tutorial",
      tier: "contradicted",
      receipt: `says "${scratch[0]}", still has ${marks.join(", ")}`,
    };
  }
  return {
    id: "4",
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
const STACK_CLAIM = /\b(?:built|written|made|implemented|coded)\s+(?:entirely\s+|purely\s+|from scratch\s+)?(?:in|with)\s+(?:pure\s+)?([A-Za-z]+[+#]*)/gi;
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

  for (const claim of claimedLanguages(claimText(repo))) {
    let bytes = 0;
    for (const lang of LANGUAGES[claim]!) bytes += repo.languages[lang] ?? 0;
    const share = bytes / total;
    if (share >= MIN_SHARE) continue;

    const actual = Object.entries(repo.languages).sort((a, b) => b[1] - a[1])[0]![0];
    return {
      id: "5",
      group: "Wrapper",
      tier: "contradicted",
      receipt: `claims ${claim}, GitHub counts ${Math.round(share * 100)}% (mostly ${actual})`,
    };
  }
  return null;
}

// --- P1: tests and CI ---

const TEST_FILE = /(\.test\.|\.spec\.|_test\.go$|(^|\/)test_[^/]+\.py$|(^|\/)(tests?|__tests__|spec)\/)/;

export function testsAndCi(repo: RepoData): Signal | null {
  const tests = repo.files.filter((f) => TEST_FILE.test(f.path) && !IGNORED_DIRS.some((d) => f.path.includes(d)));
  const ci = repo.files.some((f) => f.path.startsWith(".github/workflows/"));
  if (tests.length === 0 && !ci) return null;

  const parts: string[] = [];
  if (tests.length > 0) parts.push(`${tests.length} test files`);
  if (ci) parts.push("CI workflows");
  return { id: "P1", group: "credit", tier: "credit", receipt: parts.join(" and ") };
}

// --- entry point ---

export function scanRepo(repo: RepoData): Signal[] {
  const results = [readmeVsLogic(repo), llmWrapper(repo), templateFingerprint(repo), stackMismatch(repo), testsAndCi(repo)];
  return results.filter((s): s is Signal => s !== null);
}

// Smallest runnable check: `bun src/scan.ts`
if (import.meta.main) {
  const fake: RepoData = {
    fullName: "someone/todo-app",
    description: "An autonomous AI agent built from scratch in Rust",
    isFork: false,
    stars: 0,
    defaultBranch: "main",
    createdAt: "2026-01-01T00:00:00Z",
    pushedAt: "2026-01-01T00:00:00Z",
    files: [
      { path: "src/index.ts", size: 4000 }, // about 100 lines
      { path: "node_modules/big/index.js", size: 900000 },
      { path: "public/next.svg", size: 1000 },
      { path: "package.json", size: 300 },
    ],
    treeTruncated: false,
    readme: "word ".repeat(500),
    languages: { TypeScript: 4000 },
    commits: [],
    manifests: { "package.json": JSON.stringify({ dependencies: { openai: "^4", next: "15" } }) },
    fetchedAt: "2026-10-05T00:00:00Z",
  };

  console.assert(logicLines(fake) === 100, "node_modules and non-code files are skipped");
  const ids = scanRepo(fake).map((s) => `${s.id}:${s.tier}`);
  console.assert(ids.join(",") === "1:suspicious,2:contradicted,4:contradicted,5:contradicted", `got ${ids}`);

  console.assert(claimedLanguages("Written in pure C++ and built with React").join() === "c++", "React is not a language");
  console.assert(llmDependencies({ ...fake, manifests: { "requirements.txt": "openai>=1.0\nflask\nlangchain-core" } }).join() === "openai,langchain-core");

  const clean = { ...fake, fullName: "someone/real", description: "", readme: "", manifests: {}, files: [{ path: "src/a.test.ts", size: 10 }] };
  console.assert(scanRepo(clean).map((s) => s.id).join() === "P1", "clean repo only gets credit");

  console.log("scan.ts checks passed");
}
