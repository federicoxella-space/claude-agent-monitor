// Testi del pannello in italiano e inglese. Una lingua nuova = una tabella con le stesse chiavi (lo verifica il test).

export type Lang = 'it' | 'en'

const en = {
  title: 'Agents',
  heading: 'Session agents',
  commandDescription: 'Show session agents with model, tokens and cost',
  commandOpened: 'Agents pane opened.',
  filterLive: 'Active',
  filterAll: 'All',
  metricLive: 'Active',
  metricTokens: 'Tokens',
  metricAgentsCost: 'Agents cost',
  metricSession: 'Session',
  empty: 'No agents started in this session.',
  barTokens: 'tokens',
  barCost: 'cost',
  noTokens: 'no tokens yet',
  noCost: 'no cost yet',
  unknownPrice: 'unknown model price',
  details: '▸ details',
  less: '▾ less',
  noTools: 'No tools called.',
  footnote: (tokens: string, steps: number) => `${tokens} tokens · ${steps} ${steps === 1 ? 'step' : 'steps'}`,
  status: (n: number, cost: string) => `⚙ ${n} ${n === 1 ? 'agent' : 'agents'} · ${cost}`,
  note: 'List-price estimate · cache write at 1.25× (2× with 1 h TTL)',
  unpriced: (n: number) => ` · * ${n} without price, excluded`,
  '@starting': 'Starting…',
  '@thinking': 'Thinking…',
  '@writing': 'Writing the answer',
  '@done.answer': 'Done',
  '@done.aborted': 'Interrupted',
  '@done.error': 'API error',
  '@done.refusal': 'Refused',
}

type Strings = typeof en

const it: Strings = {
  title: 'Agenti',
  heading: 'Agenti della sessione',
  commandDescription: 'Mostra gli agenti della sessione con modello, token e costo',
  commandOpened: 'Pannello agenti aperto.',
  filterLive: 'Attivi',
  filterAll: 'Tutti',
  metricLive: 'Attivi',
  metricTokens: 'Token',
  metricAgentsCost: 'Costo agenti',
  metricSession: 'Sessione',
  empty: 'Nessun agente avviato in questa sessione.',
  barTokens: 'token',
  barCost: 'costo',
  noTokens: 'nessun token ancora',
  noCost: 'nessun costo ancora',
  unknownPrice: 'prezzo del modello sconosciuto',
  details: '▸ dettagli',
  less: '▾ meno',
  noTools: 'Nessun tool chiamato.',
  footnote: (tokens: string, steps: number) => `${tokens} token · ${steps} step`,
  status: (n: number, cost: string) => `⚙ ${n} ${n === 1 ? 'agente' : 'agenti'} · ${cost}`,
  note: 'Stima a listino · cache write a 1,25× (con TTL 1 h costa 2×)',
  unpriced: (n: number) => ` · * ${n} senza prezzo, esclusi`,
  '@starting': 'In avvio…',
  '@thinking': 'Sta ragionando…',
  '@writing': 'Scrive la risposta',
  '@done.answer': 'Concluso',
  '@done.aborted': 'Interrotto',
  '@done.error': 'Errore API',
  '@done.refusal': 'Rifiutato',
}

export const STRINGS: Record<Lang, Strings> = { en, it }

/** Attività fisse salvate come chiave e tradotte al disegno; le altre sono testo di un tool */
export type ActivityKey = Extract<keyof Strings, `@${string}`>
export const activityText = (s: Strings, activity: string) =>
  activity.startsWith('@') && activity in s ? (s[activity as ActivityKey] as string) : activity

/** "italian", "Italiano", "it", "it_IT.UTF-8", "en-US" → it | en; altro → undefined */
export const parseLang = (value: unknown): Lang | undefined => {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  if (/^(it|ita)([_\-.@].*)?$/.test(v) || v.startsWith('italian')) return 'it'
  if (/^(en|eng)([_\-.@].*)?$/.test(v) || v.startsWith('english') || v.startsWith('inglese')) return 'en'
  return undefined
}

/** Priorità: opzione della mod (se non "auto") → `language` di Claude Code → LANG/LC_ALL → inglese */
export const resolveLang = (option: unknown, ccLanguage: unknown, ...envLangs: unknown[]): Lang =>
  (option !== 'auto' ? parseLang(option) : undefined) ??
  parseLang(ccLanguage) ??
  envLangs.map(parseLang).find(l => l !== undefined) ??
  'en'
