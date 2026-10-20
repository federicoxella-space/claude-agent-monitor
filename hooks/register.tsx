import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow } from '../types'
import {
  costOf, costParts, describeTool, effortLabel, eighthsBar, family, fmtCost, fmtDuration, fmtTokens,
  shortModel, sumCost, svgBar, totalTokens, zeroUsage,
} from './cost'

const PANE = 'agent-monitor'
const TITLE = 'Agenti'
const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, {})
const expanded = atom({ plugin: 'agent-monitor', key: 'expanded' } as const, null)
const showAll = atom({ plugin: 'agent-monitor', key: 'showAll' } as const, false)

type $ = EngineInterface

const PARTS = ['input', 'output', 'cache read', 'cache write']

// Rampa per famiglia: [pill bg, pill fg, input, output, cache read, cache write]
const PALETTE = {
  opus: ['#EEEDFE', '#3C3489', '#534AB7', '#7F77DD', '#AFA9EC', '#CECBF6'],
  sonnet: ['#E1F5EE', '#085041', '#0F6E56', '#1D9E75', '#5DCAA5', '#9FE1CB'],
  haiku: ['#FAECE7', '#712B13', '#993C1D', '#D85A30', '#F0997B', '#F5C4B3'],
  fable: ['#FAEEDA', '#633806', '#854F0B', '#BA7517', '#EF9F27', '#FAC775'],
  mythos: ['#FAEEDA', '#633806', '#854F0B', '#BA7517', '#EF9F27', '#FAC775'],
  other: ['#F1EFE8', '#444441', '#5F5E5A', '#888780', '#B4B2A9', '#D3D1C7'],
} as const

const isLive = (a: AgentRow) => a.status === 'running' || a.status === 'thinking'
// Solo agenti registrati da agent.spawn (i fork interni restano nascosti) e avviati dopo l'inizio della sessione (/clear la riavvia)
const visible = (all: Record<string, AgentRow>, since: number) =>
  Object.values(all).filter(a => a.type !== '' && a.startedAt >= since)
const costText = (c: { usd: number; unpriced: number }) => fmtCost(c.usd) + (c.unpriced ? '*' : '')

const newRow = (id: string, now: number): AgentRow => ({
  id, description: '', type: '', startedAt: now, status: 'running',
  activity: 'In avvio…', recent: [], steps: 0, usage: zeroUsage(),
})

// Crea la riga se un evento dell'agente arriva prima di agent.spawn
const upsert = async ($: $, id: string, fn: (a: AgentRow) => AgentRow) => {
  const now = await $.clock.now()
  await update($, agents, all => ({ ...all, [id]: fn(all[id] ?? newRow(id, now)) }))
  await refreshStatus($)
}

// Ricalcola la status line dallo stato corrente; il tick la richiama ogni secondo, così due chiamate concorrenti
// arrivate fuori ordine non lasciano mai un valore vecchio per più di un secondo
const refreshStatus = async ($: $) => {
  const rows = visible(await read($, agents), (await $.session.usage()).startedAt)
  const live = rows.filter(isLive).length
  $.ui.status(live ? `⚙ ${live} ${live === 1 ? 'agente' : 'agenti'} · ${costText(sumCost(rows))}` : undefined)
  return live
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Ogni secondo: status line sempre allineata; ridisegno del pannello (timer) solo mentre qualche agente lavora
    $.clock.every(1000, () => {
      void refreshStatus($).then(live => {
        if (live) $.ui.invalidate('ui.render')
      })
    })
    // /agents è già un comando della CLI da terminale
    await $.command.register({ name: 'agent-monitor', description: 'Mostra gli agenti della sessione con modello, token e costo' })
    return next(e)
  })

  on('command.run', { command: 'agent-monitor' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Pannello agenti aperto.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      // Anche per un agente ripreso (resume, teammate risvegliato): torna attivo, il timer riparte
      await upsert($, r.agentId, a => ({
        ...a, description: e.description, type: e.subagentType, model: a.model ?? r.model,
        status: 'running', endedAt: undefined, activity: 'In avvio…',
      }))
      void $.ui.open({ id: PANE, title: TITLE })
    }
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) return yield* next(e)

    await upsert($, id, a => ({
      ...a, model: e.model, effort: e.effort === undefined ? a.effort : String(e.effort),
      status: 'thinking', activity: 'Sta ragionando…', endedAt: undefined,
    }))
    const r = yield* next(e)
    const now = await $.clock.now()
    await upsert($, id, a => {
      const u = r.usage
      const tools = r.toolUses.map(t => describeTool(t.name, t.input))
      return {
        ...a,
        model: u?.model ?? a.model,
        steps: a.steps + 1,
        status: a.status === 'thinking' ? 'running' : a.status,
        activity: tools[0] ?? (r.answer ? 'Scrive la risposta' : a.activity),
        recent: [...tools.map(text => ({ at: now, text })), ...a.recent].slice(0, 5),
        usage: u ? {
          input: a.usage.input + u.input_tokens,
          output: a.usage.output + u.output_tokens,
          cacheRead: a.usage.cacheRead + u.cache_read_input_tokens,
          cacheWrite: a.usage.cacheWrite + u.cache_creation_input_tokens,
        } : a.usage,
      }
    })
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      const outcome = { answer: 'Concluso', aborted: 'Interrotto', error: 'Errore API', refusal: 'Rifiutato' }[e.reason]
      await upsert($, id, a => ({
        ...a, endedAt: now, status: e.reason === 'answer' ? 'done' : 'failed', activity: outcome,
      }))
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // Svg c'è su desktop, VS Code e mobile; il terminale usa gli ottavi di cella
    const Svg = 'Svg' in els ? els.Svg : undefined
    const session = await $.session.usage()
    const all = visible(await read($, agents), session.startedAt).sort((a, b) => b.startedAt - a.startedAt)
    const open = await read($, expanded)
    const everyone = await read($, showAll)
    const now = await $.clock.now()
    const cols = e.props.bodyColumns ?? 60
    const barWidth = Math.max(10, cols - 6)

    const live = all.filter(isLive)
    const rows = everyone ? all : [...live, ...all.filter(a => !isLive(a)).slice(0, 3)]
    const agentsCost = sumCost(all)
    const tokens = all.reduce((s, a) => s + totalTokens(a.usage), 0)

    const metric = (label: string, value: string, extra?: string) => (
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderDimColor paddingX={1}>
        <Text dimColor size="footnote">{label}</Text>
        <Text bold size="heading">{value}{extra ? <Text dimColor size="footnote"> {extra}</Text> : ''}</Text>
      </Box>
    )

    const LABEL = 6
    const bar = (label: string, parts: number[] | undefined, colors: readonly string[], titles: string[], empty: string) => {
      const tot = parts?.reduce((s, p) => s + p, 0) ?? 0
      const w = Math.max(4, barWidth - LABEL - 1)
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Box width={LABEL}><Text dimColor size="caption">{label}</Text></Box>
          {tot <= 0 || !parts
            ? <Text dimColor size="caption">{empty}</Text>
            : Svg
              ? <Box flexGrow={1}><Svg source={svgBar(parts, colors, titles)} alt={`${label}: ${titles.join(', ')}`} height={8} isInteractive /></Box>
              : <Text>{eighthsBar(parts, w).map(r =>
                  <Text color={colors[r.fg]} backgroundColor={r.bg === undefined ? undefined : colors[r.bg]}>{r.text}</Text>)}</Text>}
        </Box>
      )
    }

    const bars = (a: AgentRow, pal: readonly string[]) => {
      const u = a.usage
      const colors = pal.slice(2)
      const tok = [u.input, u.output, u.cacheRead, u.cacheWrite]
      const usd = costParts(a.model, u)
      const pct = (x: number, xs: number[]) => `${Math.round((x / Math.max(1e-12, xs.reduce((s, y) => s + y, 0))) * 100)}%`
      return (
        <Box flexDirection="column">
          {bar('token', tok, colors, tok.map((n, i) => `${PARTS[i]} ${fmtTokens(n)} (${pct(n, tok)})`), 'nessun token ancora')}
          {bar('costo', usd, colors, (usd ?? []).map((c, i) => `${PARTS[i]} ${fmtCost(c)} (${pct(c, usd!)})`),
            usd ? 'nessun costo ancora' : 'prezzo del modello sconosciuto')}
        </Box>
      )
    }

    const card = (a: AgentRow) => {
      const pal = PALETTE[family(a.model)]
      const isOpen = open === a.id
      const elapsed = fmtDuration((a.endedAt ?? now) - a.startedAt)
      const cost = fmtCost(costOf(a.model, a.usage))

      if (!isLive(a) && !isOpen) {
        return (
          <Box key={a.id} flexDirection="row" gap={1} paddingX={1} marginTop={1}>
            <Text color={a.status === 'failed' ? 'error' : 'success'}>{a.status === 'failed' ? '✗' : '✓'}</Text>
            <Text dimColor>{a.description}</Text>
            <Text dimColor size="footnote">{a.type}</Text>
            <Box flexGrow={1} />
            <Text dimColor size="footnote">{shortModel(a.model)} · {effortLabel(a.effort)} · {elapsed}</Text>
            <Text dimColor>{cost}</Text>
            <Button key={`open-${a.id}`} plain label="▸" onPress={() => update($, expanded, () => a.id)} />
          </Box>
        )
      }

      return (
        <Box key={a.id} flexDirection="column" borderStyle="round" borderColor={isLive(a) ? pal[3] : 'inactive'}
          paddingX={1} marginTop={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={a.status === 'thinking' ? 'warning' : isLive(a) ? 'success' : 'inactive'}>●</Text>
            <Text bold>{a.description}</Text>
            <Text dimColor size="footnote">{a.type}</Text>
            <Box flexGrow={1} />
            <Text color={pal[3]} bold>{shortModel(a.model)} - {effortLabel(a.effort)}</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text color={a.status === 'thinking' ? 'warning' : 'suggestion'}>{a.status === 'thinking' ? '◌' : '↳'}</Text>
            <Text mono size="footnote" dimColor={a.status === 'thinking'}>{a.activity}</Text>
            <Box flexGrow={1} />
            <Text dimColor tabular>⏱ {elapsed}</Text>
          </Box>
          {bars(a, pal)}
          <Box flexDirection="row" gap={1}>
            <Button key={`toggle-${a.id}`} plain label={isOpen ? '▾ meno' : '▸ dettagli'}
              onPress={() => update($, expanded, cur => (cur === a.id ? null : a.id))} />
            <Text dimColor size="footnote">{fmtTokens(totalTokens(a.usage))} token · {a.steps} step</Text>
            <Box flexGrow={1} />
            <Text bold>{cost}</Text>
          </Box>
          {isOpen && (
            <Box flexDirection="column" marginTop={1}>
              <Text size="footnote">
                <Text color={pal[2]}>█</Text> input {fmtTokens(a.usage.input)}   <Text color={pal[3]}>█</Text> output {fmtTokens(a.usage.output)}   <Text color={pal[4]}>█</Text> cache read {fmtTokens(a.usage.cacheRead)}   <Text color={pal[5]}>█</Text> cache write {fmtTokens(a.usage.cacheWrite)}
              </Text>
              {a.recent.length === 0 && <Text dimColor size="footnote">Nessun tool chiamato.</Text>}
              {a.recent.map(r => (
                <Text mono size="footnote"><Text dimColor>{fmtDuration(r.at - a.startedAt)}</Text> {r.text}</Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold size="heading">Agenti della sessione</Text>
          <Box flexGrow={1} />
          <Button key="filter-live" label="Attivi" variant={everyone ? 'secondary' : 'primary'} onPress={() => update($, showAll, () => false)} />
          <Button key="filter-all" label="Tutti" variant={everyone ? 'primary' : 'secondary'} onPress={() => update($, showAll, () => true)} />
          {/* toglie dallo stato tutte le righe concluse, anche quelle di prima di un /clear */}
          <Button key="clear-done" label="Pulisci conclusi" onPress={async () => {
            await update($, agents, cur => Object.fromEntries(Object.entries(cur).filter(([, a]) => isLive(a))))
            await update($, expanded, id => (id !== null && all.some(a => a.id === id && !isLive(a)) ? null : id))
          }} />
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          {metric('Attivi', String(live.length), `/ ${all.length}`)}
          {metric('Token', fmtTokens(tokens))}
          {metric('Costo agenti', costText(agentsCost))}
          {metric('Sessione', fmtCost(session.cost?.usd))}
        </Box>
        {rows.length === 0 && (
          <Box marginTop={1}><Text dimColor>Nessun agente avviato in questa sessione.</Text></Box>
        )}
        {rows.map(card)}
        <Box marginTop={1}>
          <Text dimColor size="caption">Stima a listino · cache write a 1,25× (con TTL 1 h costa 2×){agentsCost.unpriced ? ` · * ${agentsCost.unpriced} senza prezzo, esclusi` : ""}</Text>
        </Box>
      </Box>
    )
  })
}
