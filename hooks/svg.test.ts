import { expect, test } from 'claude-code/testing'

import type { AgentRow } from '../types'
import { cardSvg, headerSvg, rowSvg, toneOf } from './svg'

const agent: AgentRow = {
  id: 'a1', description: 'Analizza <ciclo> vita', type: 'general-purpose', model: 'claude-opus-5-5', effort: 'high',
  startedAt: 0, status: 'thinking', activity: '@thinking', recent: [{ at: 5000, text: 'Read a.ts' }], steps: 2,
  usage: { input: 1000, output: 3000, cacheRead: 0, cacheWrite: 0 },
}
const text = {
  activity: 'Sta ragionando…', barTokens: 'token', barCost: 'costo', noTokens: '-', noCost: '-', unknownPrice: '?',
  footnote: '4k token · 2 step', noTools: 'nessuno', parts: ['input', 'output', 'cache read', 'cache write'],
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

test('intestazione e riga compatta', () => {
  const h = headerSvg(600, 'Agenti', { text: '● LIVE', isLive: true }, [{ label: 'Attivi', value: '01' }])
  expect(h.includes('ATTIVI')).toBe(true)
  const r = rowSvg(600, { ...agent, status: 'failed', endedAt: 4000 }, 9000)
  expect(r.includes('✗')).toBe(true)
  expect(r.includes('0:04')).toBe(true)
})

test('pannello stretto: metadati tagliati, legenda a capo', () => {
  const slow = { ...agent, model: 'claude-sonnet-4-5', effort: '32000', status: 'done' as const, endedAt: 3_723_000 }
  const r = rowSvg(288, slow, 0)
  expect(r.includes('1:02:03')).toBe(false)
  expect(r.includes('…')).toBe(true)
  const wide = cardSvg(600, agent, 0, true, true, text).height
  const narrow = cardSvg(288, agent, 0, true, true, text).height
  expect(narrow > wide).toBe(true)
})
