# deeplarp

Scores how much a GitHub profile or repo is larping: what it claims against what the code shows. Gives a 0-100 larp score, an archetype and receipts. Roast mode for other people, fix-it mode for yourself.

Decided in a grill session on 2026-10-05.

## Decisions

1. **Audience: roast + self-audit.** Same engine. Scanning someone else gives a roast line. Scanning your own `gh` login gives a fix list ordered by points saved. Receipts only, never a verdict on intent.
2. **Surface: CLI first, web later.** `bunx deeplarp <user|owner/repo>`. The core is plain functions (`scan() -> report`) that never touch the terminal. The web wrapper (Next.js + `next/og`) gets built once calibration passes (see 6).
3. **Input: profile and repo.** `owner/repo` scans one repo. `user` runs the repo scan on pinned repos + top 20 by stars (`--repos <n>` changes the 20, `--all` scans every non-fork repo, paging past GitHub's 100-repo page), plus profile signals. Tutorial patterns (signals 1, 6, suspicious 4) only count on the showcase: pinned repos, or the 6 "Popular repositories" GitHub shows when nothing is pinned. Claims count on every repo. Budget (changed 2026-10-05 from 4 repos / 80 calls / 10s): about 150 API calls and 7-13 seconds for a big profile, so roughly 33 uncached profile scans per hour.
4. **Judging: heuristics score, LLM narrates.** The score never depends on an LLM. `claude -p` (optional, `--model`, default haiku) extracts claims from the bio and README and rewrites the top quip. Without `claude` you get the same score with regex claims and template quips.
5. **Scoring: weighted sum + evidence tiers.** Every signal is `suspicious` or `contradicted`. The top band (75-100) needs at least one contradicted signal, so suspicion alone caps at 74. Positive evidence subtracts.
6. **Calibration bar.** 30 hand-labelled profiles, and the engine's archetype matches on at least 25. Public fixtures: Real Ones and self-declared graph-fakers only. Friends and ambiguous cases go in a gitignored `fixtures.local.json`. Nick's own profile is a labelled fixture.

## v1 signals

| # | Signal | Group | Tier |
|---|---|---|---|
| 1 | README words vs lines of logic | Tutorial | suspicious |
| 2 | LLM wrapper: claims "agentic", "autonomous", "AI engine", "AI-powered" or "intelligent", logic is mostly SDK calls. A bare "agent" doesn't count (an agent on an SDK is an accurate description) | Wrapper | contradicted |
| 3 | Empty claim: hype words ("production-ready", "world's first", "AI-powered"...) in the pitch, under 50 lines of code. Skips docs/list repos, profile READMEs, third-party write-ups | Wrapper | contradicted |
| 4 | Template fingerprint (create-next-app/Vite defaults, tutorial names) | Tutorial | suspicious, contradicted if it claims "from scratch" |
| 5 | Claimed stack vs GitHub language breakdown | Wrapper | contradicted |
| 6 | Big-bang: 3000+ lines of code in 3 or fewer commits (added 2026-10-05; at 1500 it mostly caught students uploading finished class projects) | Tutorial | suspicious |
| 7 | Fork padding: forks with zero own commits | Farmer | suspicious |
| 8 | Backdated commits: scripted-looking runs (one repeated message or one clock time) dated before their repo existed, or with author dates 30+ days before the commit | Farmer | contradicted if before the repo existed, else suspicious |
| P1 | Tests and CI exist | credit | subtracts |
| P2 | Merged PRs to other people's repos | credit | subtracts |

A signal that fires on more than one repo adds half its weight per extra repo (3 empty-claim repos: 35 + 18 + 18 = 71). Repos that label themselves a learning exercise ("practice project", "course project", "bootcamp", "followed a tutorial", or practice/assignment/tutorial in the name) skip signals 1, 6 and suspicious 4. A "from scratch" claim over template files still counts.

Credits only offset suspicious Wrapper and Tutorial points, and at most -20 in total. Contradicted signals and Farmer signals always count in full: tests in one repo don't undo a painted graph or an empty claim in another (changed 2026-10-06; before, -20 of credit could hide a 35-point contradiction).

Lines of code are file bytes / 40, notebooks (`.ipynb`) at bytes / 400 because most of their bytes are outputs. `.sol`, `.r`, `.sh` count as code. HTML doesn't: an "AI-powered" repo that is one `index.html` has no code.

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
- `--json` full report, `--no-llm`, `--model <m>`, `--fresh` (bypass the 24h cache), `-v`/`--version`.
- Card flags, mirroring agent-wrapped: `--card [file.png|file.svg]`, `--layout wide|square|story`, `--theme auto|green|yellow|red|orange|violet|blue|magenta`, `--palette <palette.toml>` (swatch `[roles]`), `--format png|svg|both`, `--handle <name>`. Any of them turns the card on.
- Card is opt-in when scanning someone else and on by default in self mode.
- Card layout matches agent-wrapped (changed 2026-10-06): terminal title bar and `$ npx deeplarp <target>` line, score + archetype + the top two signals as the reason, quip as the accent headline, `›` receipts (2/4/6 by layout), tiles for repos scanned / contradicted / suspicious / credits. Square and story add per-group point bars, or on a clean profile (no group points) a "what backs it up" panel with one bar per credit that replaces the receipt list.

## Stack

Bun + TypeScript for dev, Node 20+ at runtime. Plain `fetch` for GitHub REST and GraphQL. Token from `gh auth token`, falling back to `GITHUB_TOKEN`. There is no anonymous mode. Cache at `~/.deeplarp/cache/`, 24h TTL. Card: `satori` + `@resvg/resvg-js`, renderer copied from agent-wrapped. These are the only two runtime dependencies.

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

## Status (2026-10-06)

Steps 1-9 done. Step 10 (publish) prepared, not shipped.

- Publish prep (2026-10-06): runs on Node 20+ (Bun only for dev, tests and the build), so `npx deeplarp` works. `bun build` bundles `src/cli.ts` to `dist/cli.js`, `prepack` builds it. Tarball is `dist/` + `assets/` (fonts with their OFL texts), no tests or calibration. MIT LICENSE and README added. `.github/workflows/publish.yml` is copied from agent-wrapped/brushwork: OIDC trusted publishing on GitHub release, environment `npm`. It does nothing until a trusted publisher exists, and npm can't create one for an unpublished package, so 0.1.0 goes up by hand (`npm publish`). From 0.1.1 on, a GitHub release is the only publish path.
- shipping-clis audit (2026-10-06): verify battery passes (JSON on stdout only, `--help` in any position, unknown flags, bad values, no token, no `claude`, unknown user all exit with a sentence). Found and fixed: the repo query had no privacy filter, so a self-scan with the gh token included 4 private repos (`pi` was in the receipts). Now `privacy: PUBLIC`. Added `deeplarp-cli/SKILL.md` for agents. No man page and no vhs demo: published tools can't install a man page, and the card PNG is the hero.
- The listed claims now read the same 500-char pitch window signal 3 scores on (was 2000). The kernel README's note to "AI-powered coding assistants" was showing up as a torvalds claim.

- Real-world pass (2026-10-05): 60 profiles. 17 working devs (contributors ranked 15 to 30 on next.js, react, deno, ruff, tailwind, django): all Real One or NPC. 10 "AI founder"-style bios: all Real One after fixes. 27 clone/hype repo owners: 10 Real One (each backed by real tests or merged PRs), 10 Unproven, 2 Tutorial Graduate, 4 NPC, 1 org (not scannable). Owners of LLM-wrapper repos: Wrapper Founder, 50/100. Fixes from it: fork padding needs half the profile, self-declared SDKs/wrappers skip signal 2, template tests and CI-only no longer earn P1, template weight 15 -> 20, Unproven archetype.
- Hype-repo pass (2026-10-05): 35 low-star repos found by "enterprise-grade", "production-ready", "world's first". Added signal 3 after finding repos that pitch a product with zero code, including one profile with 3 "AI engine" repos made of 354 empty source files. Manifests are now read up to 2 folders deep. Empty test files no longer earn P1. Re-ran all groups: no new flags on working devs.
- Calibration: 66/67 on `fixtures.json` (15 famous Real Ones, 15 self-declared graph painters, and 37 profiles recovered from the real-world pass: 17 working devs, 10 AI-founder bios, 10 clone-repo owners with real tests or PRs). The one miss (xtropi) comes out Portfolio Speedrunner because it also has a template repo, which is arguably right. Wrapper and Tutorial archetypes still have no fixtures, so signals 1-6 have no measured accuracy.
- What calibration changed: signal 8 as first written (author vs committer date) caught almost no painters, because painting scripts set both dates. It now checks dates against the repo's creation date and needs a scripted pattern. Version-bump runs are excluded.
- Wrapper and Tutorial archetypes have no public fixtures yet (by design, they go in `fixtures.local.json`). Nick's own profile still needs a label there.
- Budget: see decision 3. Repo fetches run 10 at a time to stay under GitHub's per-minute limit.
- Credit and line-count pass (2026-10-06): credits stopped offsetting contradicted and Farmer signals, notebooks count as code, stack claims accept Jupyter Notebook (Python), Vue/Svelte/Astro (TS/JS) and Cuda (C++), bare "agent" dropped from signal 2. Effect on the real-world set: prophen (honest Q&A agent on the AI SDK) stays Real One only because of the "agent" change. Damianwojownik (a "world's first AI-powered RPG" pitch with no code) went from hidden to Wrapper Founder 35. Counting HTML as code was tried and dropped: it let a one-`index.html` "AI-powered GNN" repo escape signal 3 and rescued nobody.
- 20-repo pass (2026-10-05): widening from 4 to 20 repos first flagged simonw (100) and gnoff (61, React core) and dropped calibration to 25/30. Causes: TIL/workshop/research repos, plugins, bug-repro repos from create-next-app, vague "platform/framework/engine" claims. Fixed with the showcase rule, docs-type and scratch-name exemptions, plugin/extension as self-declared wrappers, and "AI engine" only. Back to 29/30, all 17 working devs Real One or NPC, known larpers still caught.

## Landscape

- `akritagrawal-stack/LARPDetector`: macOS Electron dossier for LinkedIn profiles. Investigative tone, checks only that GitHub work exists.
- `augur-radar` (npm): scores repos 0-100 for substance vs larp, to help pick libraries from search results. No claims, profiles or cards.
- LinkedIn post larp detectors (`linkedin-larp-detector`, `sxeptical/larp-detector`). Different input.

deeplarp's angle: claims checked against the code, a profile rollup, and the roast format.
