# agent-monitor

**English** · [Italiano](README.it.md)

A Claude Code mod that shows the session's agents (subagents) in a live pane: model, effort, activity, duration, tokens and estimated cost.

![agent-monitor pane with four active agents: haiku, opus, sonnet and fable at different effort levels](docs/pannello.png)

## What it shows

**Totals at the top**

| Box | Meaning |
|---|---|
| Active | Running agents / total agents |
| Tokens | Tokens across all agents |
| Agents cost | Sum of each agent's estimate |
| Session | Actual cost of the whole session (as in `/cost`), main conversation included, so it is not comparable with "Agents cost" |

**Card for each running agent**

- Task description, agent type and `model - effort`, in the model family's colour (purple opus, teal sonnet, coral haiku, amber fable).
- Activity: the first tool requested in the latest step (`Edit src/parser.ts`), "Thinking…" while the model works, "Writing the answer" when the step calls no tools.
- Duration since the agent first started: for a resumed agent it includes the pauses.
- Two bars with the same four segments (input, output, cache read, cache write):
  - **tokens**: how much context the agent moves;
  - **cost**: where the money actually goes (cache reads weigh a lot in tokens and little in cost).

  On desktop they are continuous SVG bars; in the terminal they use eighth-of-a-cell blocks.
- "▸ details" shows the four counters as numbers and the last 5 tools called.

**Finished agents**: one compact row with ✓, or ✗ with the outcome (Interrupted, API error, Refused); "▸" expands it again.

**Buttons**

- **Active**: running agents plus the last 3 finished ones. **All**: the whole session.
- **🗑 (clear finished)**: removes every finished agent, including failed ones and those from before a `/clear`.

**Status line**: `⚙ 3 agents · $0.84` while at least one agent is running; the cost adds up every agent in the session, finished ones included.

Only agents started by the Agent tool after the session began (or after the latest `/clear`) are listed; the engine's internal forks stay hidden.

## Command

`/agent-monitor` opens the pane. The pane also opens by itself whenever a new agent starts, so it comes back even if you closed it.

## Language

The pane is available in English and Italian. The mod's `language` option (plugin configuration menu) can be:

- `auto` (default): follows Claude Code's `language` setting in `settings.json` (e.g. `"language": "italian"`), then the `LC_ALL` / `LANG` variables; if none of them names a supported language, English is used;
- `it` or `en`: forces the language.

## Installation

At the prompt of a terminal session:

```
/plugin install agent-monitor --marketplace federicoxella-space/claude-agent-monitor
```

From a shell:

```bash
claude plugin install agent-monitor --marketplace federicoxella-space/claude-agent-monitor
```

In the desktop app: + next to the prompt box → Plugins → Add marketplace with `federicoxella-space/claude-agent-monitor` → Add plugin.

Hooks modules of installed plugins are in early access: if the mod does not start, add this to `~/.claude/settings.json`

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

## Cost notes

- List-price estimate, from a fixed table in `hooks/cost.ts` that has to be updated by hand for new models. Discounts and enterprise pricing are not included.
- Cache writes are priced at 1.25× input (5 min TTL); with a 1 h TTL the actual cost is 2×.
- An agent whose model is not in the table shows "unknown model price" in its cost bar and is left out of the totals: the total gets a `*` and the footer says how many agents were excluded.
