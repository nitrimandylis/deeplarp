# deeplarp

Scores how much a GitHub profile or repo is larping: what it claims against what the code shows. Gives a 0-100 larp score, an archetype and receipts. Roast mode for other people, fix-it mode for yourself.

Decided in a grill session on 2026-10-05.

## Decisions

1. **Audience: roast + self-audit.** Same engine. Scanning someone else gives a roast line. Scanning your own `gh` login gives a fix list ordered by points saved. Receipts only, never a verdict on intent.
2. **Surface: CLI first, web later.** `bunx deeplarp <user|owner/repo>`. The core is plain functions (`scan() -> report`) that never touch the terminal. The web wrapper (Next.js + `next/og`) gets built once calibration passes (see 6).
3. **Input: profile and repo.** `owner/repo` scans one repo. `user` runs the repo scan on pinned repos + top 3 by stars (max 4), plus profile signals. Budget: about 80 API calls and under 10 seconds per profile.
4. **Judging: heuristics score, LLM narrates.** The score never depends on an LLM. `claude -p` (optional) extracts claims from the bio and README and rewrites the top quip. Without `claude` you get the same score with regex claims and template quips.
5. **Scoring: weighted sum + evidence tiers.** Every signal is `suspicious` or `contradicted`. The top band (75-100) needs at least one contradicted signal, so suspicion alone caps at 74. Positive evidence subtracts.
6. **Calibration bar.** 30 hand-labelled profiles, and the engine's archetype matches on at least 25. Public fixtures: Real Ones and self-declared graph-fakers only. Friends and ambiguous cases go in a gitignored `fixtures.local.json`. Nick's own profile is a labelled fixture.

## v1 signals

| # | Signal | Group | Tier |
|---|---|---|---|
| 1 | README words vs lines of logic | Tutorial | suspicious |
| 2 | LLM wrapper: claims engine/model/agent, logic is mostly SDK calls | Wrapper | contradicted |
| 3 | Empty claim: hype words ("production-ready", "world's first", "AI-powered"...) in the pitch, under 50 lines of code. Skips docs/list repos, profile READMEs, third-party write-ups | Wrapper | contradicted |
| 4 | Template fingerprint (create-next-app/Vite defaults, tutorial names) | Tutorial | suspicious, contradicted if it claims "from scratch" |
| 5 | Claimed stack vs GitHub language breakdown | Wrapper | contradicted |
| 6 | Big-bang: 3000+ lines of code in 3 or fewer commits (added 2026-10-05; at 1500 it mostly caught students uploading finished class projects) | Tutorial | suspicious |
| 7 | Fork padding: forks with zero own commits | Farmer | suspicious |
| 8 | Backdated commits: scripted-looking runs (one repeated message or one clock time) dated before their repo existed, or with author dates 30+ days before the commit | Farmer | contradicted if before the repo existed, else suspicious |
| P1 | Tests and CI exist | credit | subtracts |
| P2 | Merged PRs to other people's repos | credit | subtracts |

A signal that fires on more than one repo adds half its weight per extra repo (3 empty-claim repos: 35 + 18 + 18 = 71). Repos that label themselves a learning exercise ("practice project", "course project", "bootcamp", "followed a tutorial", or practice/assignment/tutorial in the name) skip signals 1, 6 and suspicious 4. A "from scratch" claim over template files still counts.

Credits are floored at -20 in total, so tests and PRs can't erase a contradiction.

Cut on purpose: star quality (bought stars aren't the owner's larp), experience claims (too many false positives), liveness (an abandoned side project isn't larp).

## Archetypes

- Score under 20 with at least one credit (tests or merged PRs): **Real One**
- Score under 20 with no credits: **Unproven** (nothing contradicted, nothing proven)
- Fewer than 3 non-fork repos, or account under 30 days old: **NPC** (no score)
- Otherwise use the top group. If the second group is at least 60% of the top one, use the combo name instead.

| | Wrapper | Tutorial | Farmer |
|---|---|---|---|
| single | Wrapper Founder | Tutorial Graduate | Contribution Farmer |
| + Wrapper | | Prompt Engineer | Hype Merchant |
| + Tutorial | | | Portfolio Speedrunner |

Quips are deterministic rules (a `when` guard + a template, ordered most surprising first). Receipts stay deadpan.

## Output

- Terminal report every time: score, archetype, cap note, receipts, then a roast line or a fix list.
- `--json` full report, `--card [path]` PNG, `--no-llm`, `--fresh` (bypass the 24h cache).
- Card is opt-in when scanning someone else and on by default in self mode.

## Stack

Bun + TypeScript. Plain `fetch` for GitHub REST and GraphQL. Token from `gh auth token`, falling back to `GITHUB_TOKEN`. There is no anonymous mode. Cache at `~/.deeplarp/cache/`, 24h TTL. Card: `satori` + `@resvg/resvg-js`, renderer copied from agent-wrapped. These are the only two runtime dependencies.

## Build order

1. Fetch layer + cache
2. Repo scanner: signals 1, 2, 4, 5, P1
3. Score, tiers, 74 cap, check script
4. Profile rollup: 7, 8, P2, top-4 repos
5. Archetypes + quips
6. Calibration to 25/30
7. Self mode + fix list
8. `claude -p` layer
9. Card
10. Publish (GitHub public + npm via OIDC)

Local commits only until v1 is done. Publish after.

## Status (2026-10-05)

Steps 1-9 done. Step 10 (publish) not started.

- Real-world pass (2026-10-05): 60 profiles. 17 working devs (contributors ranked 15 to 30 on next.js, react, deno, ruff, tailwind, django): all Real One or NPC. 10 "AI founder"-style bios: all Real One after fixes. 27 clone/hype repo owners: 10 Real One (each backed by real tests or merged PRs), 10 Unproven, 2 Tutorial Graduate, 4 NPC, 1 org (not scannable). Owners of LLM-wrapper repos: Wrapper Founder, 50/100. Fixes from it: fork padding needs half the profile, self-declared SDKs/wrappers skip signal 2, template tests and CI-only no longer earn P1, template weight 15 -> 20, Unproven archetype.
- Hype-repo pass (2026-10-05): 35 low-star repos found by "enterprise-grade", "production-ready", "world's first". Added signal 3 after finding repos that pitch a product with zero code, including one profile with 3 "AI engine" repos made of 354 empty source files. Manifests are now read up to 2 folders deep. Empty test files no longer earn P1. Re-ran all groups: no new flags on working devs.
- Calibration: 28/30 on `fixtures.json` (15 Real Ones, 15 self-declared graph painters). Both misses (pavsap, xtropi) come out Portfolio Speedrunner: they also have template repos, so Tutorial reaches 60%+ of Farmer.
- What calibration changed: signal 8 as first written (author vs committer date) caught almost no painters, because painting scripts set both dates. It now checks dates against the repo's creation date and needs a scripted pattern. Version-bump runs are excluded.
- Wrapper and Tutorial archetypes have no public fixtures yet (by design, they go in `fixtures.local.json`). Nick's own profile still needs a label there.
- Budget: a fresh profile scan is 22-29 API calls and 4-9 seconds. Most of that is GraphQL, with the commit batches in parallel.

## Landscape

- `akritagrawal-stack/LARPDetector`: macOS Electron dossier for LinkedIn profiles. Investigative tone, checks only that GitHub work exists.
- `augur-radar` (npm): scores repos 0-100 for substance vs larp, to help pick libraries from search results. No claims, profiles or cards.
- LinkedIn post larp detectors (`linkedin-larp-detector`, `sxeptical/larp-detector`). Different input.

deeplarp's angle: claims checked against the code, a profile rollup, and the roast format.
