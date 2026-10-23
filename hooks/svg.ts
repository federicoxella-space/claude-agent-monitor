// Disegni SVG del pannello su desktop, nello stile della mod git-graph: font monospace, palette calda,
// glow, nodi esagonali, etichette maiuscole. Il terminale non li usa: disegna con i componenti nativi.
import type { AgentRow } from '../types'
import { costOf, costParts, effortLabel, family, fmtCost, fmtDuration, fmtTokens, shortModel, totalTokens } from './cost'

/** Pixel per cella del font del desktop: il pannello è misurato in celle. */
export const CELL_W = 7.8
/** Pixel tenuti a destra di ogni card per il suo pulsante nativo. */
export const BUTTON_W = 32

const CHAR = 7.8
const MID_CHAR = 7.2
const SMALL_CHAR = 6.7

/** Lo sfondo che Claude Code dipinge sotto ogni componente: serve solo a bucare le linee dietro i nodi. */
const HOST = '#212121'
const LINE = '#3A3532'
const MUTED = '#9A8F85'
const TEXT = '#E5DED6'
const BRIGHT = '#EDE6DE'
const SOFT = '#C9B79C'
const AMBER = '#F59E0B'
const RED = '#EF4444'

export type Tone = { stroke: string; light: string; segs: readonly [string, string, string, string] }

/** Una tinta calda per famiglia, come i branch di git-graph; segs = input, output, cache read, cache write. */
export const TONES: Record<ReturnType<typeof family>, Tone> = {
  fable: { stroke: '#F59E0B', light: '#FCD34D', segs: ['#B45309', '#F59E0B', '#FCD34D', '#FEF3C7'] },
  mythos: { stroke: '#F59E0B', light: '#FCD34D', segs: ['#B45309', '#F59E0B', '#FCD34D', '#FEF3C7'] },
  opus: { stroke: '#D946EF', light: '#F5D0FE', segs: ['#A21CAF', '#D946EF', '#F0ABFC', '#FAE8FF'] },
  sonnet: { stroke: '#F43F5E', light: '#FDA4AF', segs: ['#BE123C', '#F43F5E', '#FDA4AF', '#FFE4E6'] },
  haiku: { stroke: '#FDBA74', light: '#FFEDD5', segs: ['#C2410C', '#FB923C', '#FDBA74', '#FFEDD5'] },
  other: { stroke: '#9A8F85', light: '#D6CEC6', segs: ['#6B625B', '#9A8F85', '#B3A89E', '#D6CEC6'] },
}
export const toneOf = (model: string | undefined) => TONES[family(model)]

export const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cut = (text: string, chars: number): string =>
  chars <= 1 ? '' : text.length <= chars ? text : `${text.slice(0, Math.max(0, chars - 1))}…`

const n = (value: number): string => String(Math.round(value * 10) / 10)

function shell(W: number, H: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>text{font-family:ui-monospace,'JetBrains Mono','Cascadia Code',Consolas,monospace}` +
    `.m{fill:${TEXT};font-size:12px}.d{fill:${MUTED};font-size:11px}.b{font-size:11px;text-anchor:middle}` +
    `.l{fill:${MUTED};font-size:10px;letter-spacing:.5px}.sep{stroke:#332E2B;stroke-dasharray:2 4}</style>` +
    // La regione del glow è tutto il disegno: legata al riquadro dell'elemento, una linea sola ha larghezza 0
    `<defs><filter id="g" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="2.2" result="b"/>` +
    `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<polygon id="hx" points="0,-7 6.06,-3.5 6.06,3.5 0,7 -6.06,3.5 -6.06,-3.5"/></defs>` +
    body +
    `</svg>`
  )
}

export type Metric = { label: string; value: string; extra?: string; color?: string }

export const HEADER_H = 104

/** Titolo con il glifo ambra, stato a destra e i quattro totali sotto, come il footer di git-graph. */
export function headerSvg(W: number, title: string, state: { text: string; isLive: boolean }, metrics: Metric[]): string {
  let out =
    `<text x="32" y="33" fill="${AMBER}" font-size="12" filter="url(#g)">◢</text>` +
    `<text x="${W - 24}" y="34" fill="${state.isLive ? AMBER : MUTED}" font-size="11" text-anchor="end"${state.isLive ? ' filter="url(#g)"' : ''}>${esc(state.text)}</text>` +
    `<text x="50" y="33" fill="${BRIGHT}" font-size="13">${esc(cut(title, Math.floor((W - 74 - state.text.length * SMALL_CHAR - 16) / CHAR)))}</text>` +
    `<line x1="24" y1="55.5" x2="${W - 24}" y2="55.5" stroke="${LINE}"/>`

  const slot = (W - 48) / metrics.length
  metrics.forEach((m, i) => {
    const cx = 24 + slot * (i + 0.5)
    const room = Math.floor((slot - 8) / SMALL_CHAR)
    out +=
      `<text x="${n(cx)}" y="80" font-size="15" text-anchor="middle" fill="${m.color ?? BRIGHT}"${m.color ? ' filter="url(#g)"' : ''}>${esc(m.value)}` +
      (m.extra ? `<tspan fill="${MUTED}" font-size="11"> ${esc(m.extra)}</tspan>` : '') +
      `</text>` +
      `<text x="${n(cx)}" y="97" class="l" text-anchor="middle">${esc(cut(m.label.toUpperCase(), room))}</text>`
    if (i > 0) out += `<line x1="${n(24 + slot * i)}" y1="66" x2="${n(24 + slot * i)}" y2="98" stroke="${LINE}"/>`
  })

  return shell(W, HEADER_H, out)
}

/** Riga di messaggio al centro: nessun agente, nessuno attivo. */
export function messageSvg(W: number, message: string): string {
  return shell(W, 40, `<text x="${n(W / 2)}" y="24" class="m" text-anchor="middle" fill-opacity="0.8">${esc(cut(message, Math.floor((W - 48) / MID_CHAR)))}</text>`)
}

/** Barra a quattro segmenti con il glow, larga `w` pixel a partire da `x`. */
function bar(x: number, y: number, w: number, parts: readonly number[], colors: readonly string[]): string {
  const tot = parts.reduce((s, p) => s + p, 0)
  let at = x
  let segs = ''
  parts.forEach((p, i) => {
    const sw = (p / tot) * w
    if (sw > 0) segs += `<rect x="${n(at)}" y="${y}" width="${n(Math.max(1, sw))}" height="6" fill="${colors[i]}"/>`
    at += sw
  })

  return (
    `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="6" rx="1" fill="#332E2B"/>` +
    `<g filter="url(#g)">${segs}</g>`
  )
}

export type CardText = {
  activity: string
  barTokens: string
  barCost: string
  noTokens: string
  noCost: string
  unknownPrice: string
  footnote: string
  noTools: string
  parts: readonly string[]
}

/** Card di un agente attivo, o concluso e aperto: nodo, descrizione, badge del modello, attività, barre, dettagli. */
export function cardSvg(W: number, a: AgentRow, now: number, isLive: boolean, isOpen: boolean, t: CardText): { source: string; height: number } {
  const tone = toneOf(a.model)
  const thinking = a.status === 'thinking'
  const right = W - 16
  let out = ''

  // Riga 1: nodo esagonale, descrizione, tipo; a destra il badge modello · effort
  const badge = cut(`${shortModel(a.model)} · ${effortLabel(a.effort)}`, 28)
  const bw = badge.length * SMALL_CHAR + 16
  const bx = right - bw
  out +=
    `<use href="#hx" x="20" y="20" fill="${HOST}"/>` +
    `<use href="#hx" x="20" y="20" fill="${isLive ? tone.stroke : MUTED}" fill-opacity="0.18" stroke="${isLive ? tone.stroke : MUTED}" stroke-width="1.6"/>` +
    (isLive ? `<circle cx="20" cy="20" r="2.5" fill="${tone.light}" filter="url(#g)"/>` : '') +
    (thinking
      // Onda che parte dal bordo dell'esagono e si allarga svanendo, poi riparte da capo
      ? `<circle cx="20" cy="20" r="7" fill="none" stroke="${tone.stroke}" stroke-width="1">` +
        `<animate attributeName="r" values="7;15" dur="1s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0.8;0" dur="1s" repeatCount="indefinite"/></circle>`
      : '') +
    `<rect x="${n(bx)}" y="11" width="${n(bw)}" height="18" rx="2" fill="${tone.stroke}" fill-opacity="0.12" stroke="${tone.stroke}"${isLive ? ' filter="url(#g)"' : ''}/>` +
    `<text x="${n(bx + bw / 2)}" y="24" fill="${tone.light}" class="b">${esc(badge)}</text>`
  const room = Math.floor((bx - 12 - 36) / CHAR)
  const desc = cut(a.description, room)
  out += `<text x="36" y="24" fill="${isLive ? BRIGHT : SOFT}" font-size="13">${esc(desc)}</text>`
  const typeX = 36 + desc.length * CHAR + 10
  const typeRoom = Math.floor((bx - 12 - typeX) / SMALL_CHAR)
  if (typeRoom >= 4) out += `<text x="${n(typeX)}" y="24" class="d">${esc(cut(a.type, typeRoom))}</text>`

  // Riga 2: attività e durata
  const elapsed = fmtDuration((a.endedAt ?? now) - a.startedAt)
  const failed = a.status === 'failed'
  out +=
    `<text x="36" y="46" font-size="12" fill="${thinking ? AMBER : failed ? RED : MUTED}">${thinking ? '◌' : failed ? '✗' : isLive ? '↳' : '✓'}</text>` +
    `<text x="${right}" y="46" fill="${SOFT}" font-size="11" text-anchor="end">⏱ ${elapsed}</text>` +
    `<text x="52" y="46" font-size="12" fill="${thinking ? MUTED : failed ? RED : TEXT}">${esc(cut(t.activity, Math.floor((right - 70 - 52) / MID_CHAR)))}</text>`

  // Righe 3-4: barre token e costo
  const u = a.usage
  const tok = [u.input, u.output, u.cacheRead, u.cacheWrite]
  const usd = costParts(a.model, u)
  const barX = 96
  const barW = right - barX
  const barRow = (y: number, label: string, parts: number[] | undefined, empty: string) =>
    `<text x="36" y="${y + 6}" class="l">${esc(label.toUpperCase())}</text>` +
    (parts && parts.reduce((s, p) => s + p, 0) > 0
      ? bar(barX, y, barW, parts, tone.segs)
      : `<text x="${barX}" y="${y + 6}" class="d">${esc(empty)}</text>`)
  out += barRow(60, t.barTokens, tok, t.noTokens) + barRow(76, t.barCost, usd, usd ? t.noCost : t.unknownPrice)

  // Piede: token · step a sinistra, costo a destra
  const cost = fmtCost(costOf(a.model, u))
  out +=
    `<line x1="36" y1="94.5" x2="${right}" y2="94.5" class="sep"/>` +
    `<text x="36" y="114" class="d">${esc(cut(t.footnote, Math.floor((right - cost.length * CHAR - 12 - 36) / SMALL_CHAR)))}</text>` +
    `<text x="${right}" y="114" fill="${isLive ? tone.light : TEXT}" font-size="13" text-anchor="end">${esc(cost)}</text>`
  let H = 128

  if (isOpen) {
    // Legenda dei quattro contatori (va a capo se non ci sta) e ultimi tool chiamati
    let x = 36
    let legend = ''
    tok.forEach((v, i) => {
      const label = `${t.parts[i]} ${fmtTokens(v)}`
      if (x > 36 && x + 13 + label.length * SMALL_CHAR > right) {
        x = 36
        H += 16
      }
      legend +=
        `<rect x="${n(x)}" y="${H + 2}" width="8" height="8" rx="1" fill="${tone.segs[i]}"/>` +
        `<text x="${n(x + 13)}" y="${H + 10}" class="d">${esc(label)}</text>`
      x += 13 + label.length * SMALL_CHAR + 16
    })
    out += `<line x1="36" y1="121.5" x2="${right}" y2="121.5" class="sep"/>` + legend
    H += 30
    const tools = a.recent.length === 0 ? [{ time: '', text: t.noTools }] : a.recent.map(r => ({ time: fmtDuration(r.at - a.startedAt), text: r.text }))
    for (const r of tools) {
      out +=
        `<text x="36" y="${H}" class="d">${esc(r.time)}</text>` +
        `<text x="${r.time ? 84 : 36}" y="${H}" class="m"${r.time ? '' : ` fill="${MUTED}"`}>${esc(cut(r.text, Math.floor((right - 84) / MID_CHAR)))}</text>`
      H += 18
    }
    H += 2
  }

  const frame = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="${isLive ? tone.stroke : LINE}"${isLive ? ` stroke-opacity="0.55"` : ''}/>`

  return { source: shell(W, H, frame + out), height: H }
}

export const ROW_H = 36

/** Riga compatta di un agente concluso: esito, descrizione, tipo; a destra modello, durata e costo. */
export function rowSvg(W: number, a: AgentRow, now: number): string {
  const failed = a.status === 'failed'
  const right = W - 16
  const cost = fmtCost(costOf(a.model, a.usage))
  const costX = right - cost.length * MID_CHAR
  const metaX = costX - 14
  // I metadati lasciano almeno 60 px alla descrizione
  const meta = cut(`${shortModel(a.model)} · ${effortLabel(a.effort)} · ${fmtDuration((a.endedAt ?? now) - a.startedAt)}`,
    Math.floor((metaX - 36 - 60) / SMALL_CHAR))
  const room = Math.floor((metaX - meta.length * SMALL_CHAR - 12 - 36) / MID_CHAR)
  const desc = cut(a.description, room)
  const typeX = 36 + desc.length * MID_CHAR + 10
  const typeRoom = Math.floor((metaX - meta.length * SMALL_CHAR - 12 - typeX) / SMALL_CHAR)

  return shell(
    W,
    ROW_H,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${ROW_H - 1}" rx="8" fill="none" stroke="${LINE}"/>` +
      `<text x="16" y="23" font-size="12" fill="${failed ? RED : SOFT}">${failed ? '✗' : '✓'}</text>` +
      `<text x="36" y="23" fill="${SOFT}" font-size="12">${esc(desc)}</text>` +
      (typeRoom >= 4 ? `<text x="${n(typeX)}" y="23" class="d">${esc(cut(a.type, typeRoom))}</text>` : '') +
      `<text x="${n(metaX)}" y="23" class="d" text-anchor="end">${esc(meta)}</text>` +
      `<text x="${right}" y="23" fill="${TEXT}" font-size="12" text-anchor="end">${esc(cost)}</text>`,
  )
}

/** Testo per chi non vede il disegno di un agente. */
export const altOf = (a: AgentRow, activity: string) =>
  `${a.description} (${a.type}), ${shortModel(a.model)} ${effortLabel(a.effort)}: ${activity}, ${fmtTokens(totalTokens(a.usage))} token, ${fmtCost(costOf(a.model, a.usage))}`
