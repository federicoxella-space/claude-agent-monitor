import type { Usage } from '../types'

// $/MTok di listino (cache 2026-10-06). Cache write a 1.25 × input (TTL 5 min): con TTL 1 h il reale è 2×, ModelUsage non distingue le due.
// ponytail: tabella fissa a prezzo di listino; sconti/prezzi aziendali non inclusi, aggiornare a mano ai nuovi modelli.
type Price = { input: number; output: number; cacheRead: number }
const PRICES: [prefix: string, price: Price][] = [
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  ['claude-haiku-4', { input: 1, output: 5, cacheRead: 0.1 }],
]

const ALIASES: Record<string, string> = {
  opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5',
  fable: 'claude-fable-5-1', mythos: 'claude-mythos-5-1',
}

/** Toglie suffissi `[1m]` e prefissi Bedrock (`anthropic.`, `us.`/`global.`/`apac.`… `anthropic.`), risolve gli alias */
export const normalizeModel = (model: string) => {
  const m = model.toLowerCase().replace(/\[.*\]$/, '').replace(/^([a-z-]+\.)?anthropic\./, '')
  return ALIASES[m] ?? m
}

export const priceOf = (model: string | undefined): Price | undefined => {
  if (!model) return undefined
  const m = normalizeModel(model)
  return PRICES.find(([prefix]) => m.startsWith(prefix))?.[1]
}

export const costOf = (model: string | undefined, u: Usage): number | undefined =>
  costParts(model, u)?.reduce((a, b) => a + b, 0)

/** Somma dei costi; `unpriced` conta i modelli senza prezzo noto, esclusi dal totale */
export const sumCost = (rows: readonly { model?: string; usage: Usage }[]) =>
  rows.reduce((acc, a) => {
    const c = costOf(a.model, a.usage)
    return c === undefined && totalTokens(a.usage) > 0
      ? { ...acc, unpriced: acc.unpriced + 1 }
      : { ...acc, usd: acc.usd + (c ?? 0) }
  }, { usd: 0, unpriced: 0 })

export const zeroUsage =(): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
export const totalTokens = (u: Usage) => u.input + u.output + u.cacheRead + u.cacheWrite

/** "claude-opus-5-5" → "opus 5.5" */
export const shortModel = (model: string | undefined) => {
  if (!model) return '—'
  const m = normalizeModel(model).replace(/^claude-/, '')
  const [family, ...ver] = m.split('-')
  const nums = ver.filter(v => /^\d{1,2}$/.test(v))
  return nums.length ? `${family} ${nums.join('.')}` : family
}

export const family = (model: string | undefined) => {
  const m = model ? normalizeModel(model) : ''
  return (['fable', 'mythos', 'opus', 'sonnet', 'haiku'] as const).find(f => m.includes(f)) ?? 'other'
}

/** Livello per nome, oppure "budget 32k" per un effort numerico */
export const effortLabel = (effort: string | undefined) =>
  effort === undefined ? '—' : /^\d+$/.test(effort) ? `budget ${fmtTokens(Number(effort))}` : effort

export const fmtTokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)

export const fmtCost = (usd: number | undefined) =>
  usd === undefined ? '$ —' : usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60))
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/')

/** Riassunto di una chiamata tool: `Edit src/parser.ts`, `Grep "foo"` */
export const describeTool = (name: string, input: unknown) => {
  const i = (input ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof i[k] === 'string' && i[k] !== '' ? (i[k] as string) : undefined)
  const path = s('file_path') ?? s('path')
  const arg =
    (path && baseName(path)) ??
    (s('pattern') && `"${s('pattern')}"`) ??
    s('command') ?? s('description') ?? s('url') ?? s('query') ?? s('prompt')
  return clip(arg ? `${name} ${arg.replace(/\s+/g, ' ')}` : name)
}

/** Costo in $ di ciascun contatore [input, output, cache read, cache write]; undefined se il modello non ha prezzo */
export const costParts = (model: string | undefined, u: Usage): number[] | undefined => {
  const p = priceOf(model)
  if (!p) return undefined
  return [u.input * p.input, u.output * p.output, u.cacheRead * p.cacheRead, u.cacheWrite * p.input * 1.25].map(x => x / 1e6)
}

export type BarRun = { text: string; fg: number; bg?: number }
const LEFT_EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/**
 * Barra a ottavi di cella: ogni cella è `█` del segmento che la occupa, oppure, dove due segmenti
 * si incontrano, un blocco sinistro di k/8 col colore del primo su sfondo del secondo.
 * Restituisce run di celle uguali (fg/bg = indice del segmento).
 * ponytail: dove 3+ segmenti cadono nella stessa cella vincono i primi due; serve una cella < 1/8 per notarlo.
 */
export const eighthsBar = (parts: readonly number[], width: number): BarRun[] => {
  const tot = parts.reduce((a, b) => a + b, 0)
  if (tot <= 0 || width <= 0) return []
  const W = width * 8
  // confini cumulativi in ottavi; ogni segmento non nullo ha almeno un ottavo
  const ends: number[] = []
  let acc = 0
  parts.forEach((p, i) => {
    acc += p
    const prev = ends[i - 1] ?? 0
    ends.push(Math.min(W, Math.max(p > 0 ? prev + 1 : prev, Math.round((acc / tot) * W))))
  })
  ends[ends.length - 1] = W
  const owner = (x: number) => ends.findIndex(e => x < e)

  const runs: BarRun[] = []
  const push = (ch: string, fg: number, bg?: number) => {
    const last = runs[runs.length - 1]
    if (last && last.fg === fg && last.bg === bg && ch === '█' && last.text.endsWith('█')) last.text += ch
    else runs.push({ text: ch, fg, bg })
  }
  for (let c = 0; c < width; c++) {
    const L = owner(c * 8)
    const k = Math.min(8, ends[L]! - c * 8)
    if (k >= 8) push('█', L)
    else push(LEFT_EIGHTHS[k]!, L, owner(c * 8 + k))
  }
  return runs
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Barra SVG continua (desktop): segmenti proporzionali con tooltip, estremi arrotondati */
export const svgBar = (parts: readonly number[], colors: readonly string[], titles: readonly string[]) => {
  const tot = parts.reduce((a, b) => a + b, 0)
  const W = 1000, H = 8
  let x = 0
  const rects = tot <= 0 ? '' : parts.map((p, i) => {
    const w = (p / tot) * W
    const r = w > 0 ? `<rect x="${x.toFixed(2)}" width="${w.toFixed(2)}" height="${H}" fill="${colors[i]}"><title>${esc(titles[i] ?? '')}</title></rect>` : ''
    x += w
    return r
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
    `<defs><clipPath id="r"><rect width="${W}" height="${H}" rx="${H / 2}" ry="${H / 2}"/></clipPath></defs>` +
    `<g clip-path="url(#r)"><rect width="${W}" height="${H}" fill="#88878033"/>${rects}</g></svg>`
}
