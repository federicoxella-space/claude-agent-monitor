# agent-monitor

Mod di Claude Code che mostra in un pannello live gli agenti (subagenti) della sessione:

- modello ed effort di ogni agente
- cosa sta facendo (ultimo tool chiamato) e da quanto tempo
- token usati (input, output, cache read, cache write) e costo stimato, con due barre: token e costo
- totali in alto, voce nella status line (`⚙ 3 agenti · $0.84`) e pulsante "Pulisci conclusi"

Comando: `/agent-monitor` apre il pannello (si apre anche da solo al primo agente).

## Installazione

Al prompt di una sessione da terminale:

```
/plugin install agent-monitor --marketplace federicoxella-space/claude-agent-monitor
```

Da shell:

```bash
claude plugin install agent-monitor --marketplace federicoxella-space/claude-agent-monitor
```

Nell'app desktop: + accanto al prompt → Plugins → Add marketplace con `federicoxella-space/claude-agent-monitor` → Add plugin.

I moduli di hook dei plugin installati sono in early access: se la mod non parte, aggiungi a `~/.claude/settings.json`

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

## Note sui costi

Stima a prezzo di listino (tabella in `hooks/cost.ts`): sconti e prezzi aziendali non sono inclusi, la cache write è calcolata a 1,25× l'input (TTL 5 min; con TTL 1 h il costo reale è 2×). Il pannello mostra accanto anche il costo reale della sessione.
