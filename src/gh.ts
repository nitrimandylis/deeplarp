// GitHub fetch layer + on-disk cache.
// Everything the scanners need for one repo is pulled here, once, and saved as JSON.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.github.com";
const CACHE_DIR = join(homedir(), ".deeplarp", "cache");
const CACHE_HOURS = 24;
// Root files read for dependency names. Only fetched when present in the tree.
const MANIFESTS = ["package.json", "requirements.txt", "pyproject.toml"];

export type TreeFile = { path: string; size: number };

export type Commit = {
  sha: string;
  message: string;
  authorDate: string;
  committerDate: string;
};

export type RepoData = {
  fullName: string;
  description: string | null;
  isFork: boolean;
  stars: number;
  defaultBranch: string;
  createdAt: string;
  pushedAt: string;
  files: TreeFile[];
  treeTruncated: boolean;
  readme: string; // empty string when the repo has no README
  languages: Record<string, number>; // language -> bytes
  commits: Commit[]; // newest first, up to 100
  manifests: Record<string, string>; // root manifest path -> file text
  fetchedAt: string;
};

let cachedToken: string | null = null;

export function getToken(): string {
  if (cachedToken) return cachedToken;

  const result = Bun.spawnSync(["gh", "auth", "token"]);
  const fromGh = result.stdout.toString().trim();
  if (result.exitCode === 0 && fromGh) {
    cachedToken = fromGh;
    return fromGh;
  }

  const fromEnv = process.env.GITHUB_TOKEN;
  if (fromEnv) {
    cachedToken = fromEnv;
    return fromEnv;
  }

  throw new Error("No GitHub token. Run `gh auth login` or set GITHUB_TOKEN.");
}

// Counts every request so the CLI can report the API cost of a scan.
export let apiCalls = 0;

async function ghGet(path: string, accept = "application/vnd.github+json"): Promise<Response> {
  apiCalls++;
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${getToken()}`, Accept: accept },
  });

  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : "later";
    throw new Error(`GitHub rate limit hit. Try again after ${when}.`);
  }
  return res;
}

async function ghJson(path: string): Promise<any> {
  const res = await ghGet(path);
  if (res.status === 404) throw new Error(`Not found on GitHub: ${path}`);
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}

function cachePath(fullName: string): string {
  return join(CACHE_DIR, fullName.replace("/", "__") + ".json");
}

export function isFresh(fetchedAt: string, now: Date = new Date()): boolean {
  const ageHours = (now.getTime() - new Date(fetchedAt).getTime()) / 3_600_000;
  return ageHours < CACHE_HOURS;
}

function readCache(fullName: string): RepoData | null {
  const file = cachePath(fullName);
  if (!existsSync(file)) return null;
  const data: RepoData = JSON.parse(readFileSync(file, "utf8"));
  // Caches written before a field existed are treated as stale.
  if (!data.manifests) return null;
  return isFresh(data.fetchedAt) ? data : null;
}

function writeCache(data: RepoData): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(data.fullName), JSON.stringify(data, null, 2));
}

export async function fetchRepo(fullName: string, fresh = false): Promise<RepoData> {
  if (!fresh) {
    const cached = readCache(fullName);
    if (cached) return cached;
  }

  const meta = await ghJson(`/repos/${fullName}`);
  const branch: string = meta.default_branch;

  // An empty repo has no tree, so a 409 here just means "no files".
  let files: TreeFile[] = [];
  let treeTruncated = false;
  const treeRes = await ghGet(`/repos/${fullName}/git/trees/${branch}?recursive=1`);
  if (treeRes.ok) {
    const tree = await treeRes.json();
    treeTruncated = tree.truncated;
    for (const item of tree.tree) {
      if (item.type === "blob") files.push({ path: item.path, size: item.size });
    }
  }

  let readme = "";
  const readmeRes = await ghGet(`/repos/${fullName}/readme`, "application/vnd.github.raw+json");
  if (readmeRes.ok) readme = await readmeRes.text();

  const languages = await ghJson(`/repos/${fullName}/languages`);

  let commits: Commit[] = [];
  const commitsRes = await ghGet(`/repos/${fullName}/commits?per_page=100`);
  if (commitsRes.ok) {
    const raw = await commitsRes.json();
    for (const c of raw) {
      commits.push({
        sha: c.sha,
        message: c.commit.message,
        authorDate: c.commit.author.date,
        committerDate: c.commit.committer.date,
      });
    }
  }

  const manifests: Record<string, string> = {};
  for (const name of MANIFESTS) {
    if (!files.some((f) => f.path === name)) continue;
    const res = await ghGet(`/repos/${fullName}/contents/${name}`, "application/vnd.github.raw+json");
    if (res.ok) manifests[name] = await res.text();
  }

  const data: RepoData = {
    fullName: meta.full_name,
    description: meta.description,
    isFork: meta.fork,
    stars: meta.stargazers_count,
    defaultBranch: branch,
    createdAt: meta.created_at,
    pushedAt: meta.pushed_at,
    files,
    treeTruncated,
    readme,
    languages,
    commits,
    manifests,
    fetchedAt: new Date().toISOString(),
  };
  writeCache(data);
  return data;
}

// Smallest runnable check: `bun src/gh.ts`
if (import.meta.main) {
  const now = new Date("2026-10-05T12:00:00Z");
  console.assert(isFresh("2026-10-05T00:00:00Z", now) === true, "12h old should be fresh");
  console.assert(isFresh("2026-10-04T11:00:00Z", now) === false, "25h old should be stale");
  console.log("gh.ts checks passed");
}
