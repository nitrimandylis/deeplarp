// GitHub fetch layer + on-disk cache.
// Everything the scanners need for one repo is pulled here, once, and saved as JSON.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const API = "https://api.github.com";
const CACHE_DIR = join(homedir(), ".deeplarp", "cache");
const CACHE_HOURS = 24;
// Bump when RepoData or ProfileData changes shape, so old cache files get refetched.
const CACHE_VERSION = 4;
// Files read for dependency names, at the root or up to 2 folders down
// (full-stack repos keep them in backend/ and frontend/). Shallowest first, max 4.
const MANIFESTS = ["package.json", "requirements.txt", "pyproject.toml"];
const MANIFEST_MAX_DEPTH = 2;
const MAX_MANIFESTS = 4;

export function manifestPaths(files: TreeFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    if (parts.length - 1 > MANIFEST_MAX_DEPTH) continue;
    if (!MANIFESTS.includes(parts[parts.length - 1]!)) continue;
    if (file.path.includes("node_modules/")) continue;
    found.push(file.path);
  }
  found.sort((a, b) => a.split("/").length - b.split("/").length);
  return found.slice(0, MAX_MANIFESTS);
}

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
  manifests: Record<string, string>; // manifest path -> file text
  fetchedAt: string;
};

let cachedToken: string | null = null;

export function getToken(): string {
  if (cachedToken) return cachedToken;

  const result = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  const fromGh = (result.stdout ?? "").trim();
  if (result.status === 0 && fromGh) {
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

// GitHub has two limits. The hourly one (5000 requests) sets remaining to 0 and gives a
// reset time. The per-minute "secondary" one sends retry-after in seconds. Any other 403
// (a blocked repo, say) isn't a rate limit and gets handled by the caller.
export function rateLimitMessage(status: number, headers: Headers): string | null {
  if (status !== 403 && status !== 429) return null;
  const retryAfter = headers.get("retry-after");
  if (retryAfter) return `GitHub says too many requests too fast. Wait ${retryAfter} seconds and try again.`;
  if (headers.get("x-ratelimit-remaining") === "0") {
    const reset = headers.get("x-ratelimit-reset");
    const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : "later";
    return `GitHub's hourly limit is used up. Try again after ${when}.`;
  }
  return status === 429 ? "GitHub says too many requests. Wait a minute and try again." : null;
}

async function ghGet(path: string, accept = "application/vnd.github+json"): Promise<Response> {
  apiCalls++;
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${getToken()}`, Accept: accept },
  });

  const limited = rateLimitMessage(res.status, res.headers);
  if (limited) throw new Error(limited);
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
  for (const path of manifestPaths(files)) {
    const res = await ghGet(`/repos/${fullName}/contents/${path}`, "application/vnd.github.raw+json");
    if (res.ok) manifests[path] = await res.text();
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
  commits: Commit[]; // newest first, up to COMMITS_PER_REPO on the default branch
};

export type ProfileData = {
  version: number;
  login: string;
  name: string | null;
  bio: string | null;
  createdAt: string;
  pinned: string[]; // full names, in pinned order
  repos: ProfileRepo[]; // owned repos, most stars first, up to 100 (every one with `all`)
  mergedPrsElsewhere: number; // merged PRs into repos the user doesn't own
  fetchedAt: string;
};

const PROFILE_QUERY = `
query($login: String!, $prQuery: String!) {
  user(login: $login) {
    login name bio createdAt
    pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { nameWithOwner } } }
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: STARGAZERS, direction: DESC}) {
      nodes { nameWithOwner isFork stargazerCount createdAt pushedAt }
      pageInfo { hasNextPage endCursor }
    }
  }
  search(query: $prQuery, type: ISSUE) { issueCount }
}`;

// The next 100 repos after `after`, for --all on accounts with more than 100.
const REPOS_PAGE_QUERY = `
query($login: String!, $after: String!) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: STARGAZERS, direction: DESC}) {
      nodes { nameWithOwner isFork stargazerCount createdAt pushedAt }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

// Recent commits for every non-fork repo. Asking for all 100 repos' history in one
// query times out (502) on big accounts, so it goes out as parallel batches of 25,
// one aliased `repository(...)` field per repo.
const COMMITS_PER_REPO = 10;
const REPOS_PER_BATCH = 25;

export function commitsQuery(fullNames: string[]): string {
  const fields = fullNames.map((fullName, i) => {
    const [owner, name] = fullName.split("/");
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
      defaultBranchRef { target { ... on Commit {
        history(first: ${COMMITS_PER_REPO}) {
          nodes { oid messageHeadline authoredDate committedDate author { user { login } } }
        }
      } } }
    }`;
  });
  return `query {\n${fields.join("\n")}\n}`;
}

async function ghGraphql(query: string, variables: Record<string, string | null>, retries = 1): Promise<any> {
  apiCalls++;
  const res = await fetch(API + "/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  // 502/504 here means the query timed out on GitHub's side; one retry usually lands.
  if ((res.status === 502 || res.status === 504) && retries > 0) return ghGraphql(query, variables, retries - 1);
  const limited = rateLimitMessage(res.status, res.headers);
  if (limited) throw new Error(limited);
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
  const body = await res.json();
  // Partial errors (one unreadable repo in a batch) still return data; only fail on none.
  if (body.errors && !body.data) throw new Error(body.errors[0].message);
  return body.data;
}

async function fetchCommitsByRepo(fullNames: string[]): Promise<Map<string, Commit[]>> {
  const batches: string[][] = [];
  for (let i = 0; i < fullNames.length; i += REPOS_PER_BATCH) {
    batches.push(fullNames.slice(i, i + REPOS_PER_BATCH));
  }
  const results = await Promise.all(batches.map((batch) => ghGraphql(commitsQuery(batch), {})));

  const byRepo = new Map<string, Commit[]>();
  batches.forEach((batch, b) => {
    batch.forEach((fullName, i) => {
      // Empty repos have no default branch, so no history.
      const nodes = results[b][`r${i}`]?.defaultBranchRef?.target?.history?.nodes ?? [];
      byRepo.set(fullName, nodes.map((c: any) => ({
        sha: c.oid,
        authorLogin: c.author?.user?.login ?? null,
        message: c.messageHeadline,
        authorDate: c.authoredDate,
        committerDate: c.committedDate,
      })));
    });
  });
  return byRepo;
}

// The whole profile in two rounds of GraphQL: bio, pinned, repo list and merged PR
// count first, then 1-4 parallel batches of recent commits. `all` keeps paging past
// the first 100 repos, and is cached separately so a normal scan stays cheap.
export async function fetchProfile(login: string, fresh = false, all = false): Promise<ProfileData> {
  const key = "user/" + login.toLowerCase() + (all ? "-all" : "");
  if (!fresh) {
    const cached = readCache<ProfileData>(key);
    if (cached) return cached;
  }

  const prQuery = `is:pr is:merged author:${login} -user:${login}`;
  const data = await ghGraphql(PROFILE_QUERY, { login, prQuery });
  const user = data.user;
  if (!user) throw new Error(`Not a GitHub user: ${login}`);
  const repoNodes: any[] = [...user.repositories.nodes];
  let page = user.repositories.pageInfo;
  while (all && page.hasNextPage) {
    const next = await ghGraphql(REPOS_PAGE_QUERY, { login, after: page.endCursor });
    repoNodes.push(...next.user.repositories.nodes);
    page = next.user.repositories.pageInfo;
  }
  const ownRepos = repoNodes.filter((n: any) => !n.isFork).map((n: any) => n.nameWithOwner);
  const commits = await fetchCommitsByRepo(ownRepos);

  const profile: ProfileData = {
    version: CACHE_VERSION,
    login: user.login,
    name: user.name,
    bio: user.bio,
    createdAt: user.createdAt,
    pinned: user.pinnedItems.nodes.map((n: any) => n.nameWithOwner),
    repos: repoNodes.map((n: any) => ({
      fullName: n.nameWithOwner,
      isFork: n.isFork,
      stars: n.stargazerCount,
      createdAt: n.createdAt,
      pushedAt: n.pushedAt,
      commits: commits.get(n.nameWithOwner) ?? [],
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
