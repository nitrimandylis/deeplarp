// scan(target) -> Report. The only place that fetches, scans and scores in one go.
// Never prints: the CLI and the card both render from the Report.

import { fetchRepo, fetchProfile, fetchMyLogin, apiCalls, type RepoData, type ProfileData } from "./gh";
import { scanRepo, forkPadding, backdatedCommits, mergedPrs, regexClaims, type Signal } from "./scan";
import { scoreSignals, quipFor, fixesFor, type Score, type Fix } from "./score";
import { narrate } from "./llm";

export type Report = Score & {
  target: string;
  kind: "repo" | "profile";
  self: boolean;
  quip: string;
  fixes: Fix[];
  claims: string[];
  reposScanned: string[];
  npcReason: string | null;
  llm: boolean; // true when claude wrote the claims and the quip
  apiCalls: number;
};

export type ScanOptions = { fresh?: boolean; llm?: boolean };

const MAX_REPOS = 4;
const TOP_BY_STARS = 3;
const NPC_MIN_REPOS = 3;
const NPC_MIN_DAYS = 30;
// Claims live near the top of a README. Further down is usually docs or quoted lists.
const CLAIM_CHARS = 2000;

// Pinned repos first, then the top 3 by stars, max 4. Forks are skipped.
export function pickRepos(profile: ProfileData): string[] {
  const forks = new Set(profile.repos.filter((r) => r.isFork).map((r) => r.fullName));
  const picked: string[] = [];

  for (const name of profile.pinned) {
    if (!forks.has(name) && !picked.includes(name)) picked.push(name);
  }
  // profile.repos is already sorted by stars. Add 3 that aren't pinned.
  let added = 0;
  for (const repo of profile.repos) {
    if (added === TOP_BY_STARS) break;
    if (repo.isFork || picked.includes(repo.fullName)) continue;
    picked.push(repo.fullName);
    added++;
  }
  return picked.slice(0, MAX_REPOS);
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
    const profile = await fetchProfile(resolved, fresh);
    // Fetch the picked repos in parallel to stay under the 10 second budget.
    repos = await Promise.all(pickRepos(profile).map((name) => fetchRepo(name, fresh)));
    for (const repo of repos) signals.push(...scanRepo(repo));

    const profileSignals = [forkPadding(profile), backdatedCommits(profile.login, repos), mergedPrs(profile)];
    for (const s of profileSignals) if (s) signals.push(s);

    claimSources = [profile.bio ?? "", ...repos.map((r) => r.description ?? ""), ...repos.map((r) => r.readme)];
    npc = npcReason(profile);
    owner = profile.login;
  }

  const score = scoreSignals(signals, npc !== null);
  const self = owner.toLowerCase() === myLogin.toLowerCase();
  let quip = quipFor(score);
  let claims = dedupeClaims(claimSources.flatMap((text) => regexClaims(text.slice(0, CLAIM_CHARS))));
  let llm = false;

  if (options.llm !== false) {
    const story = narrate({ target: resolved, claimSources, score, quip });
    if (story) {
      claims = story.claims;
      quip = story.quip;
      llm = true;
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
    llm,
    apiCalls,
  };
}
