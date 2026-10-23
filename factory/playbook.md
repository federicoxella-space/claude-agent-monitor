# Project playbook

## Conventions
- The whole repo is in English: identifiers, code comments (short, on the why), test names, debug logs, commit messages, docs. Italian appears only in the `it` table of `hooks/i18n.ts` and in `README.it.md`.
- Modules in `hooks/`: `register.tsx` (hooks and rendering), `cost.ts` (prices, formatting, eighth-cell bars), `svg.ts` (desktop drawings), `i18n.ts` (texts). Pure logic stays out of `register.tsx` so it can be tested.
- Shared types and mod state live in `types/index.d.ts` (`AgentRow`, `Usage`, `PluginState['agent-monitor']`); a new state key is declared there and created with `atom({ plugin: 'agent-monitor', key: '<literal>' })`.
- Style: no semicolons, single quotes, exported arrow functions, 2-space indentation.
- Every visible change updates both `README.md` and `README.it.md` (same sections).
- A release bumps `version` in `.claude-plugin/plugin.json` (semver: feature → minor, fix → patch).
## Patterns
- New hook: follow `on('turn.complete', ...)` in `hooks/register.tsx`: call `next(e)`, update state with `upsert`, return `next`'s result.
- New pane text: add the key to both `en` and `it` in `hooks/i18n.ts` (a test checks the keys match); fixed activities are `@...` keys translated at draw time with `activityText`.
- Every pane element is drawn on two branches: SVG for desktop/VS Code/mobile (`hooks/svg.ts`, with `alt`) and native components for the terminal, in the same palette (`toneOf`).
- New SVG drawing: use `shell()`, `esc()` on every user text and `cut()` to fit the width; tests in `hooks/svg.test.ts`.
- New mod option: `userConfig` in `.claude-plugin/plugin.json`, read from `options` in `register`, documented in both READMEs.
## Reusable code
- Prices and costs: `costOf`, `costParts`, `sumCost`, `priceOf`, `normalizeModel` in `hooks/cost.ts`.
- Formatting: `fmtTokens`, `fmtCost`, `fmtDuration`, `shortModel`, `effortLabel`, `describeTool` in `hooks/cost.ts`.
- Terminal bars: `eighthsBar` in `hooks/cost.ts`.
- SVG text escaping and cutting: `esc`, `cut` in `hooks/svg.ts`; per-family palette: `TONES`/`toneOf`.
- Language: `resolveLang`, `parseLang` in `hooks/i18n.ts`.
## Don'ts
- Do not edit `.claude-plugin/types/` (written by the engine, git-ignored).
- No Node/DOM APIs, `require`, dynamic `import()`, fs or network: the module runs in the engine's sandbox.
- No npm dependencies and no `package.json`.
- No hardcoded visible text in `register.tsx` or `svg.ts`: it goes through `i18n.ts`.
- `plugin` and `key` of `atom(...)`, and registered command `name`s, only as string literals (required by `claude plugin validate`).
## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
- [security] No secrets in code or committed configuration.
- [code] New texts exist in both English and Italian.
- [ui] The change is drawn on both the SVG (desktop) branch and the terminal branch, narrow widths included.
- [code] `README.md` and `README.it.md` match the new behaviour.
- [code] No Italian outside the `it` table of `hooks/i18n.ts` and `README.it.md`.
- [code] A new price or model in `hooks/cost.ts` has a test in `hooks/cost.test.ts`.
