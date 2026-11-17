import { expect, test } from 'claude-code/testing'

import type { AgentRow, BgTask } from '../types'
import { backgroundSvg, bgAltOf, cardSvg, headerSvg, PULSE_MS, pulseTiming, rowSvg, toneOf } from './svg'

const agent: AgentRow = {
  id: 'a1', description: 'Analizza <ciclo> vita', type: 'general-purpose', model: 'claude-opus-5-5', effort: 'high',
  startedAt: 0, status: 'thinking', activity: '@thinking', recent: [{ at: 5000, text: 'Read a.ts' }], steps: 2,
  usage: { input: 1000, output: 3000, cacheRead: 0, cacheWrite: 0 },
}
const text = {
  activity: 'Sta ragionando…', barTokens: 'token', barCost: 'costo', noTokens: '-', noCost: '-', unknownPrice: '?',
  footnote: '4k token · 2 step', noTools: 'nessuno', parts: ['input', 'output', 'cache read', 'cache write'], bgBadge: 'bg',
}

test('palette calda per famiglia, come git-graph', () => {
  expect(toneOf('claude-fable-5-1').stroke).toBe('#F59E0B')
  expect(toneOf('opus').stroke).toBe('#D946EF')
  expect(toneOf('gpt-5').stroke).toBe('#9A8F85')
})

test('card: testo con escape, barre proporzionali, dettagli che allungano il disegno', () => {
  const closed = cardSvg(600, agent, 12_000, true, false, text)
  expect(closed.source.includes('Analizza &lt;ciclo&gt; vita')).toBe(true)
  expect(closed.source.includes('<animate')).toBe(true)
  // barra token da x=96 a 584: input 1/4, output 3/4
  expect(closed.source.includes('width="122"')).toBe(true)
  expect(closed.source.includes('width="366"')).toBe(true)
  const open = cardSvg(600, agent, 12_000, true, true, text)
  expect(open.height > closed.height).toBe(true)
  expect(open.source.includes('Read a.ts')).toBe(true)
})

test('pulse keeps its phase across redraws', () => {
  expect(pulseTiming(0)).toBe('dur="2.4s" begin="-0.000s" repeatCount="indefinite"')
  expect(pulseTiming(3_000)).toBe('dur="2.4s" begin="-0.600s" repeatCount="indefinite"')
  expect(pulseTiming(3_000 + PULSE_MS)).toBe(pulseTiming(3_000))
  expect(cardSvg(600, agent, 3_000, true, false, text).source.includes('begin="-0.600s"')).toBe(true)
  expect(cardSvg(600, { ...agent, status: 'running' }, 3_000, true, false, text).source.includes('<animate')).toBe(false)
})

test('intestazione e riga compatta', () => {
  const h = headerSvg(600, 'Agenti', { text: '● LIVE', isLive: true }, [{ label: 'Attivi', value: '01' }])
  expect(h.includes('ATTIVI')).toBe(true)
  const r = rowSvg(600, { ...agent, status: 'failed', endedAt: 4000 }, 9000, 'bg')
  expect(r.includes('✗')).toBe(true)
  expect(r.includes('0:04')).toBe(true)
})

test('pannello stretto: metadati tagliati, legenda a capo', () => {
  const slow = { ...agent, model: 'claude-sonnet-4-5', effort: '32000', status: 'done' as const, endedAt: 3_723_000 }
  const r = rowSvg(288, slow, 0, 'bg')
  expect(r.includes('1:02:03')).toBe(false)
  expect(r.includes('…')).toBe(true)
  const wide = cardSvg(600, agent, 0, true, true, text).height
  const narrow = cardSvg(288, agent, 0, true, true, text).height
  expect(narrow > wide).toBe(true)
})

const task: BgTask = { id: 't1', toolUseId: 'u1', kind: 'shell', text: 'npm run <dev>', startedAt: 0, status: 'running' }
const watch: BgTask = { id: 't2', toolUseId: 'u2', kind: 'monitor', text: 'Watch build errors', startedAt: 0, endedAt: 41_000, status: 'failed' }

test('background section: heading, glyphs, icons, escaped text, duration', () => {
  const b = backgroundSvg(600, [task, watch, { ...task, id: 't3', status: 'done', endedAt: 5000 }], 12_000, 'Background')
  expect(b.height).toBe(28 + 28 * 3)
  expect(b.source.includes('>BACKGROUND<')).toBe(true)
  expect(b.source.includes('npm run &lt;dev&gt;')).toBe(true)
  expect(b.source.includes('>●<') && b.source.includes('>✗<') && b.source.includes('>✓<')).toBe(true)
  expect(b.source.includes('>$<') && b.source.includes('>◎<')).toBe(true)
  expect(b.source.includes('0:12') && b.source.includes('0:41') && b.source.includes('0:05')).toBe(true)
  expect(backgroundSvg(600, [], 0, 'Background').height).toBe(28)
})

test('background section at 320 px: text cut, duration inside the width', () => {
  const long = { ...task, text: 'npm run dev -- --host 0.0.0.0 --port 5173 --open' }
  const b = backgroundSvg(320, [long], 12_000, 'Background')
  expect(b.source.includes('…')).toBe(true)
  expect(b.source.includes('--open')).toBe(false)
  expect(b.source.includes('<text x="304" y="46" fill="#C9B79C" font-size="11" text-anchor="end">0:12</text>')).toBe(true)
})

test('background alt text', () => {
  expect(bgAltOf('Background', [task, watch], 12_000)).toBe('Background: ● $ npm run <dev> 0:12, ✗ ◎ Watch build errors 0:41')
})

test('bg badge on card and row only for background agents', () => {
  const bg = { ...agent, background: true }
  expect(cardSvg(600, bg, 0, true, false, text).source.includes('>bg<')).toBe(true)
  expect(cardSvg(600, agent, 0, true, false, text).source.includes('>bg<')).toBe(false)
  const done = { ...bg, status: 'done' as const, endedAt: 4000 }
  expect(rowSvg(600, done, 9000, 'bg').includes('>bg<')).toBe(true)
  expect(rowSvg(600, { ...done, background: false }, 9000, 'bg').includes('>bg<')).toBe(false)
})
