---
base_branch: main
build: claude plugin validate .
lint: npx -y -p typescript@5 tsc -p .
test: claude plugin test .
ui_review: static      # none | static | browser
dev_server: ""
base_url: ""
max_rounds: 2          # rework rounds after the first review
---
Notes for every agent:
- Everything in the repo is written in English (code, comments, tests, docs, commits); Italian only in
  the `it` strings of `hooks/i18n.ts` and in `README.it.md`.
- The repo is a Claude Code mod (plugin with a hooks module), TypeScript, no `package.json` and no
  dependencies. It runs in the engine's sandbox: no DOM, no Node, no fs/network, no `require`, no
  dynamic `import()`.
- The API is declared in `.claude-plugin/types/claude-code/index.d.ts` (written by the engine,
  git-ignored, never edit it). Read it before using a new hook or `$` noun.
- `build` (`claude plugin validate .`) checks the manifest and the hooks module as the engine will
  load them; `lint` is a typecheck (`tsc`, no emit); `test` runs `hooks/*.test.ts` with the
  `claude-code/testing` kit.
- `ui_review: static`: the pane is drawn by the host (terminal and desktop), there is no dev server;
  review the SVG and the terminal tree from code and tests.

## Commit rules
- Subject in English, short, no type/scope prefix, describes the visible change
  (e.g. `Hexagon pulse ripples outward only`).
- When the change bumps the version, append `; vX.Y.Z` to the subject.
- Optional body in English, wrapped at ~72 columns, explaining the behaviour change.
