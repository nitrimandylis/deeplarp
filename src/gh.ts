// GitHub fetch layer + on-disk cache.
// Everything the scanners need for one repo is pulled here, once, and saved as JSON.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.github.com";
const CACHE_DIR = join(homedir(), ".deeplarp", "cache");
const CACHE_HOURS = 24;
// Bump when RepoData or ProfileData changes shape, so old cache files get refetched.
const CACHE_VERSION = 2;
// Root files read for dependency names. Only fetched when present in the tree.
const MANIFESTS = ["package.json", "requirements.txt", "pyproject.toml"];

export type TreeFile = { path: string; size: number };

export type Commit = {
  sha: string;
  authorLogin: string | null; // null when the commit email isn't linked to a GitHub account
  message: string;
  authorDate: string;
  committerDate: string;
};

export type RepoData = {
  version: number;
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

function cachePath(key: string): string {
  return join(CACHE_DIR, key.replace("/", "__") + ".json");
}

export function isFresh(fetchedAt: string, now: Date = new Date()): boolean {
  const ageHours = (now.getTime() - new Date(fetchedAt).getTime()) / 3_600_000;
  return ageHours < CACHE_HOURS;
}

function readCache<T extends { version: number; fetchedAt: string }>(key: string): T | null {
  const file = cachePath(key);
  if (!existsSync(file)) return null;
  const data: T = JSON.parse(readFileSync(file, "utf8"));
  if (data.version !== CACHE_VERSION) return null;
  return isFresh(data.fetchedAt) ? data : null;
}

function writeCache(key: string, data: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(key), JSON.stringify(data, null, 2));
}

export async function fetchRepo(fullName: string, fresh = false): Promise<RepoData> {
  if (!fresh) {
    const cached = readCache<RepoData>(fullName);
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
        authorLogin: c.author?.login ?? null,
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
    version: CACHE_VERSION,
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
  writeCache(fullName, data);
  return data;
}

// --- profiles ---

export type ProfileRepo = {
  fullName: string;
  isFork: boolean;
  stars: number;
  createdAt: string;
  pushedAt: string;
};

export type ProfileData = {
  version: number;
  login: string;
  name: string | null;
  bio: string | null;
  createdAt: string;
  pinned: string[]; // full names, in pinned order
  repos: ProfileRepo[]; // owned repos, most stars first, up to 100
  mergedPrsElsewhere: number; // merged PRs into repos the user doesn't own
  fetchedAt: string;
};

const PROFILE_QUERY = `
query($login: String!, $prQuery: String!) {
  user(login: $login) {
    login name bio createdAt
    pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { nameWithOwner } } }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
      nodes { nameWithOwner isFork stargazerCount createdAt pushedAt }
    }
  }
  search(query: $prQuery, type: ISSUE) { issueCount }
}`;

async function ghGraphql(query: string, variables: Record<string, string>): Promise<any> {
  apiCalls++;
  const res = await fetch(API + "/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
  const body = await res.json();
  if (body.errors && !body.data?.user) throw new Error(body.errors[0].message);
  return body.data;
}

// One GraphQL call covers the whole profile: bio, pinned, repo list and merged PR count.
export async function fetchProfile(login: string, fresh = false): Promise<ProfileData> {
  const key = "user/" + login.toLowerCase();
  if (!fresh) {
    const cached = readCache<ProfileData>(key);
    if (cached) return cached;
  }

  const prQuery = `is:pr is:merged author:${login} -user:${login}`;
  const data = await ghGraphql(PROFILE_QUERY, { login, prQuery });
  const user = data.user;
  if (!user) throw new Error(`Not a GitHub user: ${login}`);

  const profile: ProfileData = {
    version: CACHE_VERSION,
    login: user.login,
    name: user.name,
    bio: user.bio,
    createdAt: user.createdAt,
    pinned: user.pinnedItems.nodes.map((n: any) => n.nameWithOwner),
    repos: user.repositories.nodes.map((n: any) => ({
      fullName: n.nameWithOwner,
      isFork: n.isFork,
      stars: n.stargazerCount,
      createdAt: n.createdAt,
      pushedAt: n.pushedAt,
    })),
    mergedPrsElsewhere: data.search.issueCount,
    fetchedAt: new Date().toISOString(),
  };
  writeCache(key, profile);
  return profile;
}

// The login behind the token, used to switch on self mode.
// Cached like everything else, keyed under "me" (the token rarely changes owner).
export async function fetchMyLogin(): Promise<string> {
  const cached = readCache<{ version: number; fetchedAt: string; login: string }>("me");
  if (cached) return cached.login;

  const me = await ghJson("/user");
  writeCache("me", { version: CACHE_VERSION, fetchedAt: new Date().toISOString(), login: me.login });
  return me.login;
}
