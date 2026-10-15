# deeplarp web

The live scanner at deeplarp.nicktrim.com. A Next.js app that imports the CLI's core
from `../src` and its fonts from `../assets`.

```sh
bun install && (cd .. && bun install)
GITHUB_TOKEN=... bun run dev
bun test lib    # the target parser check
```

`GITHUB_TOKEN` is a fine-grained PAT with public repo read access only. Without it
the scan falls back to `gh auth token`.

Vercel: root directory `web`. `vercel.json` also installs the repo root, because
`../src` needs `satori` from the root `node_modules`.
