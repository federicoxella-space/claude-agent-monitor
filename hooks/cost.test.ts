import { expect, test } from 'claude-code/testing'

import { costOf, costParts, eighthsBar, describeTool, effortLabel, fmtDuration, shortModel, sumCost } from './cost'
import { activityText, resolveLang, STRINGS } from './i18n'

const r = (x: number | undefined) => (x === undefined ? x : Math.round(x * 1e6) / 1e6)
const u = { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 }

test('costo per famiglia di modello, alias e suffissi', () => {
  // opus 5.5: 4 + 20 + 0.20 + 4*1.25
  expect(r(costOf('claude-opus-5-5', u))).toBe(29.2)
  expect(r(costOf('opus', u))).toBe(29.2)
  expect(r(costOf('claude-opus-5-5[1m]', u))).toBe(29.2)
  // haiku 5.5: 0.1 + 0.5 + 0.01 + 0.125
  expect(r(costOf('claude-haiku-5-5', u))).toBe(0.735)
  expect(r(costOf('claude-sonnet-4-6', { ...u, cacheRead: 0, cacheWrite: 0 }))).toBe(18)
  expect(costOf('gpt-5', u)).toBe(undefined)
  expect(costOf(undefined, u)).toBe(undefined)
})

test('formati', () => {
  expect(shortModel('claude-opus-5-5')).toBe('opus 5.5')
  expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
  expect(fmtDuration(243_000)).toBe('4:03')
  expect(fmtDuration(3_723_000)).toBe('1:02:03')
  expect(describeTool('Edit', { file_path: 'C:\\repo\\src\\parser.ts' })).toBe('Edit src/parser.ts')
  expect(describeTool('Grep', { pattern: 'price' })).toBe('Grep "price"')
})

test('barra a ottavi: larghezza esatta, segmenti minimi visibili, giunture a due colori', () => {
  const runs = eighthsBar([1, 1, 10_000, 0], 20)
  expect(runs.reduce((n, r) => n + [...r.text].length, 0)).toBe(20)
  // input e output (minuscoli) hanno comunque almeno un ottavo: compaiono come fg o bg
  const used = new Set(runs.flatMap(r => (r.bg === undefined ? [r.fg] : [r.fg, r.bg])))
  expect(used.has(0) && used.has(1) && used.has(2)).toBe(true)
  expect(used.has(3)).toBe(false)
  // 50/50 su 3 celle: confine a 12/8 -> █, poi ▌ (4/8) su sfondo del secondo, poi █
  expect(eighthsBar([1, 1], 3)).toEqual([
    { text: '█', fg: 0, bg: undefined }, { text: '▌', fg: 0, bg: 1 }, { text: '█', fg: 1, bg: undefined },
  ])
  expect(eighthsBar([0, 0], 10)).toEqual([])
})

test('costo per categoria', () => {
  const parts = costParts('claude-opus-5-5', u)!.map(r)
  expect(parts).toEqual([4, 20, 0.2, 5])
  expect(costParts('ignoto', u)).toBe(undefined)
})

test('modelli Bedrock, alias mythos e modelli senza prezzo', () => {
  expect(r(costOf('global.anthropic.claude-opus-5-5', u))).toBe(29.2)
  expect(r(costOf('apac.anthropic.claude-opus-5-5', u))).toBe(29.2)
  expect(r(costOf('us-gov.anthropic.claude-opus-5-5', u))).toBe(29.2)
  expect(r(costOf('mythos', { ...u, cacheRead: 0, cacheWrite: 0 }))).toBe(60)
  const s = sumCost([
    { model: 'claude-haiku-5-5', usage: u },
    { model: 'modello-ignoto', usage: u },
    { model: undefined, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
  ])
  expect(r(s.usd)).toBe(0.735)
  expect(s.unpriced).toBe(1)
  expect(effortLabel('32000')).toBe('budget 32k')
  expect(effortLabel('high')).toBe('high')
  expect(effortLabel(undefined)).toBe('—')
})

test('lingua: opzione, poi language di Claude Code, poi LANG, inglese predefinito', () => {
  expect(resolveLang('it', 'english', 'en_US.UTF-8')).toBe('it')
  expect(resolveLang('auto', 'italian', 'en_US.UTF-8')).toBe('it')
  expect(resolveLang('auto', 'Italiano', undefined)).toBe('it')
  expect(resolveLang('auto', undefined, undefined, 'it_IT.UTF-8')).toBe('it')
  expect(resolveLang('auto', 'japanese', 'C.UTF-8')).toBe('en')
  expect(resolveLang(undefined, undefined, undefined, undefined)).toBe('en')
  expect(resolveLang('auto', 'en-GB', 'it_IT')).toBe('en')
})

test('traduzioni: stesse chiavi in ogni lingua e attività tradotte al disegno', () => {
  const keys = (o: object) => Object.keys(o).sort().join(',')
  expect(keys(STRINGS.it)).toBe(keys(STRINGS.en))
  expect(activityText(STRINGS.it, '@done.error')).toBe('Errore API')
  expect(activityText(STRINGS.en, '@thinking')).toBe('Thinking…')
  expect(activityText(STRINGS.en, 'Edit src/a.ts')).toBe('Edit src/a.ts')
  expect(STRINGS.en.status(1, '$0.10')).toBe('⚙ 1 agent · $0.10')
  expect(STRINGS.it.footnote('42k', 3)).toBe('42k token · 3 step')
})
