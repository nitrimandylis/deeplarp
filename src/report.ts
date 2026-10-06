// scan(target) -> Report. The only place that fetches, scans and scores in one go.
// Never prints: the CLI and the card both render from the Report.

import { fetchRepo, fetchProfile, fetchMyLogin, apiCalls, type RepoData, type ProfileData } from "./gh";
import { scanRepo, isTutorialPattern, forkPadding, backdatedCommits, mergedPrs, regexClaims, type Signal } from "./scan";
import { scoreSignals, quipFor, fixesFor, type Score, type Fix } from "./score";
import { narrate, DEFAULT_MODEL } from "./llm";

export type Report = Score & {
  target: string;
  kind: "repo" | "profile";
  self: boolean;
  quip: string;
  fixes: Fix[];
  claims: string[];
  reposScanned: string[];
  npcReason: string | null;
  model: string | null; // the model that wrote the claims and the quip, null without the LLM
  apiCalls: number;
};

// repos: how many top-by-stars repos to scan on a profile. Infinity scans every one.
export type ScanOptions = { fresh?: boolean; llm?: boolean; model?: string; repos?: number };

export const TOP_BY_STARS = 20;
// GitHub's secondary rate limit trips on bursts, so repos are fetched a few at a time.
const FETCH_CONCURRENCY = 10;
const NPC_MIN_REPOS = 3;
const NPC_MIN_DAYS = 30;
// Claims live near the top of a README. Further down is usually docs or quoted lists.
const CLAIM_CHARS = 2000;

// Pinned repos first, then the top `limit` by stars that aren't pinned. Forks are skipped.
export function pickRepos(profile: ProfileData, limit: number = TOP_BY_STARS): string[] {
  const forks = new Set(profile.repos.filter((r) => r.isFork).map((r) => r.fullName));
  const picked: string[] = [];

  for (const name of profile.pinned) {
    if (!forks.has(name) && !picked.includes(name)) picked.push(name);
  }
  // profile.repos is already sorted by stars.
  let added = 0;
  for (const repo of profile.repos) {
    if (added >= limit) break;
    if (repo.isFork || picked.includes(repo.fullName)) continue;
    picked.push(repo.fullName);
    added++;
  }
  return picked;
}

// Runs `work` over `items` with at most `limit` running at once, keeping input order.
export async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]!);
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// The repos a profile puts forward: pinned ones, or when nothing is pinned, the 6
// "Popular repositories" GitHub shows instead. Tutorial patterns (README padding,
// template leftovers, big-bang commits) only count here: a template left in an
// unpinned bug repro isn't being presented as anyone's portfolio.
const POPULAR_SHOWN = 6;

export function showcase(profile: ProfileData): Set<string> {
  const pinned = profile.pinned.filter((name) => profile.repos.some((r) => r.fullName === name && !r.isFork));
  if (pinned.length > 0) return new Set(pinned);
  const popular = profile.repos.filter((r) => !r.isFork).slice(0, POPULAR_SHOWN);
  return new Set(popular.map((r) => r.fullName));
}

export function npcReason(profile: ProfileData, now: Date = new Date()): string | null {
  const ownRepos = profile.repos.filter((r) => !r.isFork).length;
  if (ownRepos < NPC_MIN_REPOS) return `only ${ownRepos} non-fork repo${ownRepos === 1 ? "" : "s"}`;
  const ageDays = (now.getTime() - new Date(profile.createdAt).getTime()) / 86_400_000;
  if (ageDays < NPC_MIN_DAYS) return `account is ${Math.floor(ageDays)} days old`;
  return null;
}

// Case-insensitive dedupe that keeps the first spelling seen.
function dedupeClaims(claims: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const claim of claims) {
    if (seen.has(claim.toLowerCase())) continue;
    seen.add(claim.toLowerCase());
    out.push(claim);
  }
  return out;
}

export async function scan(target: string | null, options: ScanOptions = {}): Promise<Report> {
  const fresh = options.fresh ?? false;
  const myLogin = await fetchMyLogin();
  const resolved = target ?? myLogin;

  let kind: "repo" | "profile";
  let repos: RepoData[];
  let signals: Signal[] = [];
  let claimSources: string[];
  let npc: string | null = null;
  let owner: string;

  if (resolved.includes("/")) {
    kind = "repo";
    const repo = await fetchRepo(resolved, fresh);
    repos = [repo];
    signals = scanRepo(repo);
    claimSources = [repo.description ?? "", repo.readme];
    owner = repo.fullName.split("/")[0]!;
  } else {
    kind = "profile";
    const limit = options.repos ?? TOP_BY_STARS;
    // Over 100 repos needs the paged repo list; the first page covers everything else.
    const profile = await fetchProfile(resolved, fresh, limit > 100);
    repos = await mapLimited(pickRepos(profile, limit), FETCH_CONCURRENCY, (name) => fetchRepo(name, fresh));
    const shown = showcase(profile);
    for (const repo of repos) {
      for (const signal of scanRepo(repo)) {
        if (isTutorialPattern(signal) && !shown.has(repo.fullName)) continue;
        signals.push(signal);
      }
    }

    const profileSignals = [forkPadding(profile), backdatedCommits(profile), mergedPrs(profile)];
    for (const s of profileSignals) if (s) signals.push(s);

    claimSources = [profile.bio ?? "", ...repos.map((r) => r.description ?? ""), ...repos.map((r) => r.readme)];
    npc = npcReason(profile);
    owner = profile.login;
  }

  const score = scoreSignals(signals, npc !== null);
  const self = owner.toLowerCase() === myLogin.toLowerCase();
  let quip = quipFor(score);
  let claims = dedupeClaims(claimSources.flatMap((text) => regexClaims(text.slice(0, CLAIM_CHARS))));
  let model: string | null = null;

  if (options.llm !== false) {
    const story = narrate({ target: resolved, claimSources, score, quip }, options.model);
    if (story) {
      claims = story.claims;
      quip = story.quip;
      model = options.model ?? DEFAULT_MODEL;
    }
  }

  return {
    ...score,
    target: resolved,
    kind,
    self,
    quip,
    fixes: self ? fixesFor(score, kind) : [],
    claims,
    reposScanned: repos.map((r) => r.fullName),
    npcReason: npc,
    model,
    apiCalls,
  };
}
