import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow } from '../types'
import {
  costOf, costParts, describeTool, effortLabel, eighthsBar, fmtCost, fmtDuration, fmtTokens,
  shortModel, sumCost, totalTokens, zeroUsage,
} from './cost'
import { activityText, resolveLang, STRINGS } from './i18n'
import { altOf, BUTTON_W, CELL_W, cardSvg, HEADER_H, headerSvg, messageSvg, ROW_H, rowSvg, toneOf } from './svg'

const PANE = 'agent-monitor'
// Lingua scelta a session.start (che rigira a ogni reload); inglese finché non è risolta
let t = STRINGS.en
const agents = atom({ plugin: 'agent-monitor', key: 'agents' } as const, {})
const expanded = atom({ plugin: 'agent-monitor', key: 'expanded' } as const, null)

type $ = EngineInterface

const PARTS = ['input', 'output', 'cache read', 'cache write']

const isLive = (a: AgentRow) => a.status === 'running' || a.status === 'thinking'
// Solo agenti registrati da agent.spawn (i fork interni restano nascosti) e avviati dopo l'inizio della sessione (/clear la riavvia)
const visible = (all: Record<string, AgentRow>, since: number) =>
  Object.values(all).filter(a => a.type !== '' && a.startedAt >= since)
const costText = (c: { usd: number; unpriced: number }) => fmtCost(c.usd) + (c.unpriced ? '*' : '')

const newRow = (id: string, now: number): AgentRow => ({
  id, description: '', type: '', startedAt: now, status: 'running',
  activity: '@starting', recent: [], steps: 0, usage: zeroUsage(),
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
  $.ui.status(live ? t.status(live, costText(sumCost(rows))) : undefined)
  return live
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const settings = await $.settings.read()
    const lang = resolveLang(options.language, settings.language, await $.env.get('LC_ALL'), await $.env.get('LANG'))
    t = STRINGS[lang]
    $.ui.log(`lingua ${lang} (opzione ${String(options.language)}, language ${String(settings.language)})`, { to: 'debug' })
    // Ogni secondo: status line sempre allineata; ridisegno del pannello (timer) solo mentre qualche agente lavora
    $.clock.every(1000, () => {
      void refreshStatus($).then(live => {
        if (live) $.ui.invalidate('ui.render')
      })
    })
    // /agents è già un comando della CLI da terminale
    await $.command.register({ name: 'agent-monitor', description: t.commandDescription })
    return next(e)
  })

  on('command.run', { command: 'agent-monitor' }, async $ => {
    await $.ui.open({ id: PANE, title: t.title })
    return { text: t.commandOpened }
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      // Anche per un agente ripreso (resume, teammate risvegliato): torna attivo; la durata resta contata dal primo avvio (startedAt)
      await upsert($, r.agentId, a => ({
        ...a, description: e.description, type: e.subagentType, model: a.model ?? r.model,
        status: 'running', endedAt: undefined, activity: '@starting',
      }))
      void $.ui.open({ id: PANE, title: t.title })
    }
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) return yield* next(e)

    await upsert($, id, a => ({
      ...a, model: e.model, effort: e.effort === undefined ? a.effort : String(e.effort),
      status: 'thinking', activity: '@thinking', endedAt: undefined,
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
        activity: tools[0] ?? (r.answer ? '@writing' : a.activity),
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
      const outcome = `@done.${e.reason}`
      await upsert($, id, a => ({
        ...a, endedAt: now, status: e.reason === 'answer' ? 'done' : 'failed', activity: outcome,
      }))
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const session = await $.session.usage()
    const all = visible(await read($, agents), session.startedAt).sort((a, b) => b.startedAt - a.startedAt)
    const open = await read($, expanded)
    // Opzione `agents` della mod: "all" mostra anche i conclusi; cambiarla ricarica il modulo
    const everyone = options.agents === 'all'
    const now = await $.clock.now()
    const cols = e.props.bodyColumns ?? 60
    const barWidth = Math.max(10, cols - 6)

    const live = all.filter(isLive)
    const rows = everyone ? all : live
    const agentsCost = sumCost(all)
    const tokens = all.reduce((s, a) => s + totalTokens(a.usage), 0)

    const clearDone = async () => {
      // toglie dallo stato tutte le righe concluse, anche quelle di prima di un /clear
      await update($, agents, cur => Object.fromEntries(Object.entries(cur).filter(([, a]) => isLive(a))))
      await update($, expanded, id => (id !== null && all.some(a => a.id === id && !isLive(a)) ? null : id))
    }
    const toggle = (id: string) => update($, expanded, cur => (cur === id ? null : id))

    // Desktop, VS Code e mobile: disegni SVG nello stile di git-graph, larghi quanto il pannello e misurati in celle;
    // come immagine (niente isInteractive), quindi i pulsanti restano nativi accanto ai disegni
    if (e.surface !== 'terminal' && 'Svg' in els) {
      const Svg = els.Svg
      const W = Math.max(320, Math.floor(cols * CELL_W))
      const cardW = W - BUTTON_W
      const side = (key: string, label: string, onPress: () => unknown) => (
        <Box flexDirection="column" justifyContent="center" alignItems="center" flexGrow={1}>
          <Button key={key} plain onPress={onPress}><Text dimColor>{label}</Text></Button>
        </Box>
      )
      const metrics = [
        { label: t.metricLive, value: String(live.length), extra: `/ ${all.length}`, color: live.length ? '#F59E0B' : undefined },
        { label: t.metricTokens, value: fmtTokens(tokens) },
        { label: t.metricAgentsCost, value: costText(agentsCost) },
        { label: t.metricSession, value: fmtCost(session.cost?.usd) },
      ]

      return (
        <Box flexDirection="column">
          <Svg source={headerSvg(W, t.heading, { text: live.length ? '● LIVE' : 'IDLE', isLive: live.length > 0 }, metrics)}
            alt={`${t.heading}: ${metrics.map(m => `${m.label} ${m.value}`).join(', ')}`} width={W} height={HEADER_H} />
          {everyone && (
            <Box flexDirection="row">
              <Box flexGrow={1} />
              <Button key="clear-done" plain onPress={clearDone}><Text dimColor>🗑 {t.clearDone.toUpperCase()}</Text></Button>
            </Box>
          )}
          {rows.length === 0 && (
            <Box marginTop={1}>
              <Svg source={messageSvg(W, everyone || all.length === 0 ? t.empty : t.noneLive)} alt={everyone || all.length === 0 ? t.empty : t.noneLive} width={W} height={40} />
            </Box>
          )}
          {rows.map(a => {
            const activity = activityText(t, a.activity)
            if (!isLive(a) && open !== a.id) {
              return (
                <Box key={a.id} flexDirection="row" alignItems="stretch" marginTop={1}>
                  <Svg source={rowSvg(cardW, a, now)} alt={altOf(a, activity)} width={cardW} height={ROW_H} />
                  {side(`open-${a.id}`, '▸', () => toggle(a.id))}
                </Box>
              )
            }
            const card = cardSvg(cardW, a, now, isLive(a), open === a.id, {
              activity, barTokens: t.barTokens, barCost: t.barCost, noTokens: t.noTokens, noCost: t.noCost,
              unknownPrice: t.unknownPrice, footnote: t.footnote(fmtTokens(totalTokens(a.usage)), a.steps), noTools: t.noTools, parts: PARTS,
            })
            return (
              <Box key={a.id} flexDirection="row" alignItems="stretch" marginTop={1}>
                <Svg source={card.source} alt={altOf(a, activity)} width={cardW} height={card.height} />
                {side(`toggle-${a.id}`, open === a.id ? '▾' : '▸', () => toggle(a.id))}
              </Box>
            )
          })}
          {agentsCost.unpriced > 0 && (
            <Box marginTop={1}>
              <Text dimColor size="caption">{t.unpriced(agentsCost.unpriced)}</Text>
            </Box>
          )}
        </Box>
      )
    }

    // Terminale: componenti nativi e barre a ottavi di cella, con la stessa palette
    const metric = (label: string, value: string, extra?: string) => (
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderDimColor paddingX={1}>
        <Text dimColor size="footnote">{label}</Text>
        <Text bold size="heading">{value}{extra ? <Text dimColor size="footnote"> {extra}</Text> : ''}</Text>
      </Box>
    )

    const LABEL = 6
    const bar = (label: string, parts: number[] | undefined, colors: readonly string[], empty: string) => {
      const tot = parts?.reduce((s, p) => s + p, 0) ?? 0
      const w = Math.max(4, barWidth - LABEL - 1)
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Box width={LABEL}><Text dimColor size="caption">{label}</Text></Box>
          {tot <= 0 || !parts
            ? <Text dimColor size="caption">{empty}</Text>
            : <Text>{eighthsBar(parts, w).map(r =>
                <Text color={colors[r.fg]} backgroundColor={r.bg === undefined ? undefined : colors[r.bg]}>{r.text}</Text>)}</Text>}
        </Box>
      )
    }

    const bars = (a: AgentRow, colors: readonly string[]) => {
      const u = a.usage
      const usd = costParts(a.model, u)
      return (
        <Box flexDirection="column">
          {bar(t.barTokens, [u.input, u.output, u.cacheRead, u.cacheWrite], colors, t.noTokens)}
          {bar(t.barCost, usd, colors, usd ? t.noCost : t.unknownPrice)}
        </Box>
      )
    }

    const card = (a: AgentRow) => {
      const tone = toneOf(a.model)
      const isOpen = open === a.id
      const elapsed = fmtDuration((a.endedAt ?? now) - a.startedAt)
      const cost = fmtCost(costOf(a.model, a.usage))

      if (!isLive(a) && !isOpen) {
        return (
          <Box key={a.id} flexDirection="row" gap={1} paddingX={1} marginTop={1}>
            <Text color={a.status === 'failed' ? 'error' : 'inactive'}>{a.status === 'failed' ? '✗' : '✓'}</Text>
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
        <Box key={a.id} flexDirection="column" borderStyle="round" borderColor={isLive(a) ? tone.stroke : 'inactive'}
          paddingX={1} marginTop={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={isLive(a) ? tone.stroke : 'inactive'}>⬡</Text>
            <Text bold>{a.description}</Text>
            <Text dimColor size="footnote">{a.type}</Text>
            <Box flexGrow={1} />
            <Text color={tone.light}>[{shortModel(a.model)} · {effortLabel(a.effort)}]</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text color={a.status === 'thinking' ? 'warning' : 'inactive'}>{a.status === 'thinking' ? '◌' : '↳'}</Text>
            <Text mono size="footnote" dimColor={a.status === 'thinking'}>{activityText(t, a.activity)}</Text>
            <Box flexGrow={1} />
            <Text dimColor tabular>⏱ {elapsed}</Text>
          </Box>
          {bars(a, tone.segs)}
          <Box flexDirection="row" gap={1}>
            <Button key={`toggle-${a.id}`} plain label={isOpen ? t.less : t.details}
              onPress={() => toggle(a.id)} />
            <Text dimColor size="footnote">{t.footnote(fmtTokens(totalTokens(a.usage)), a.steps)}</Text>
            <Box flexGrow={1} />
            <Text bold>{cost}</Text>
          </Box>
          {isOpen && (
            <Box flexDirection="column" marginTop={1}>
              <Text size="footnote">
                <Text color={tone.segs[0]}>█</Text> input {fmtTokens(a.usage.input)}   <Text color={tone.segs[1]}>█</Text> output {fmtTokens(a.usage.output)}   <Text color={tone.segs[2]}>█</Text> cache read {fmtTokens(a.usage.cacheRead)}   <Text color={tone.segs[3]}>█</Text> cache write {fmtTokens(a.usage.cacheWrite)}
              </Text>
              {a.recent.length === 0 && <Text dimColor size="footnote">{t.noTools}</Text>}
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
          <Text bold size="heading">{t.heading}</Text>
          <Box flexGrow={1} />
          {everyone && <Button key="clear-done" label={`🗑 ${t.clearDone}`} onPress={clearDone} />}
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          {metric(t.metricLive, String(live.length), `/ ${all.length}`)}
          {metric(t.metricTokens, fmtTokens(tokens))}
          {metric(t.metricAgentsCost, costText(agentsCost))}
          {metric(t.metricSession, fmtCost(session.cost?.usd))}
        </Box>
        {rows.length === 0 && (
          <Box marginTop={1}><Text dimColor>{everyone || all.length === 0 ? t.empty : t.noneLive}</Text></Box>
        )}
        {rows.map(card)}
        {agentsCost.unpriced > 0 && (
          <Box marginTop={1}>
            <Text dimColor size="caption">{t.unpriced(agentsCost.unpriced)}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
