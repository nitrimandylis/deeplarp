---
name: deeplarp-cli
description: Drive the deeplarp CLI, which gives a GitHub profile or repo a 0-100 larp score by checking what its README and bio claim against what the code shows, with receipts, an archetype, a roast line and a shareable card. Use whenever the user asks if a GitHub profile or repo is legit, overhyped, a wrapper, a tutorial clone or has a faked contribution graph, wants someone's GitHub roasted, wants their own GitHub audited or a fix list, or mentions deeplarp or a larp score.
---

# deeplarp

```bash
npx deeplarp                 # the user's own profile (their gh login): fix list + card
npx deeplarp <user>          # a profile: pinned repos + top 20 by stars
npx deeplarp <owner>/<repo>  # one repo
```

Not on PATH and no network for npx? It has not been installed. Offer `npm i -g deeplarp`. Inside the repo, use `bun src/cli.ts`.

## Setup

- Needs Node 20+ and a GitHub token: `gh auth token` first, then `GITHUB_TOKEN`. There is no anonymous mode. Without either it exits 1 with a sentence saying so. Never read or print the token.
- The `claude` CLI is optional. Without it, or with `--no-llm`, the score is identical. Only the claims list and roast line change.

## Everything runs unattended

No command opens a picker, a TUI or a server, and none waits for input. Safe to run from a tool call.

```bash
npx deeplarp <target> --json --no-llm   # the right default for an agent: one JSON value on stdout, writes nothing
```

JSON keys: `score` (null for NPC), `capped`, `archetype`, `groups` (Wrapper/Tutorial/Farmer points), `signals` (`id`, `group`, `tier`, `points`, `receipts`), `target`, `kind` (profile or repo), `self`, `quip`, `fixes`, `claims`, `reposScanned`, `npcReason`, `model`, `apiCalls`. Errors go to stderr with exit 1.

## Costs

| run | cost |
|---|---|
| cached (same target within 24h) | instant, 0 API calls |
| profile, default | ~150 API calls, 7-13 s. One token gets ~33 uncached profiles an hour |
| `--all` | ~5 API calls per repo. Slow on big profiles |
| `--fresh` | skips the cache, full cost again |
| `claude -p` pass (default) | adds up to 90 s and uses the user's own Claude usage. `--no-llm` skips it |

## Things that will bite you

- **Writes a PNG to the current directory** when scanning the user's own profile without `--json`, or with any card flag (`--card`, `--layout`, `--theme`, `--format`, `--handle`). Pass `--card <path>` to put it somewhere on purpose, or `--json` to write nothing.
- **NPC is not a score.** Under 3 non-fork repos or an account under 30 days gives `score: null` and `npcReason`. Don't report it as 0.
- **Receipts, not verdicts.** The score is heuristics over public data. Say what the receipts show ("README says production-ready, repo has no code"), never that someone is lying or a fraud.
- **Suspicion alone caps at 74.** A 74 means "lots of suspicious, nothing contradicted", not "nearly caught".
- **Repo scans skip the profile signals** (fork padding, backdated commits, merged PRs). Scan the user, not one repo, to judge a person.

## What it cannot do

Organisations, private repos, GitLab, LinkedIn, star buying, years of experience. It doesn't judge code quality either, only claims against code.
