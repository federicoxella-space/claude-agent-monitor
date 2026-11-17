import type { BgTask } from '../types'

type Rec = Record<string, unknown>
type Tasks = Record<string, BgTask>
export type TaskNotice = { taskId?: string; toolUseId?: string; status?: string }

const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null
const str = (x: unknown): string | undefined => (typeof x === 'string' && x !== '' ? x : undefined)

// The tool.call outcome: undefined for a deny or an error, else the tool result
const okResult = (r: unknown): Rec | undefined => {
  if (!isRec(r) || r.deny !== undefined || r.isError === true) return undefined
  const res = r.result
  if (!isRec(res) || res.isError === true) return undefined
  return res
}

export const isRunning = (k: BgTask): boolean => k.status === 'running'

export const taskFromToolCall = (
  call: { tool: string; toolUseId: string; agentId?: string; input: Record<string, unknown> },
  r: unknown,
  now: number,
): BgTask | undefined => {
  const res = okResult(r)
  if (!res) return undefined
  const base = { toolUseId: call.toolUseId, agentId: call.agentId, startedAt: now, status: 'running' as const }
  if (call.tool === 'Bash' || call.tool === 'PowerShell') {
    const id = str(res.backgroundTaskId)
    if (!id) return undefined
    const text = typeof call.input.command === 'string' ? call.input.command.replace(/\s+/g, ' ').trim() : ''
    return { ...base, id, kind: 'shell', text }
  }
  if (call.tool === 'Monitor') {
    const id = str(res.taskId)
    if (!id) return undefined
    const text = typeof call.input.description === 'string' ? call.input.description : ''
    const ms = res.persistent === true || typeof res.timeoutMs !== 'number' || res.timeoutMs <= 0 ? undefined : res.timeoutMs
    return { ...base, id, kind: 'monitor', text, timeoutMs: ms }
  }
  return undefined
}

export const stoppedTaskId = (tool: string, r: unknown): string | undefined => {
  if (tool !== 'TaskStop') return undefined
  const res = okResult(r)
  return res ? str(res.task_id) : undefined
}

const finish = (tasks: Tasks, id: string, status: 'done' | 'failed', endedAt: number): Tasks => {
  const k = tasks[id]
  if (!k || !isRunning(k)) return tasks
  return { ...tasks, [id]: { ...k, status, endedAt } }
}

export const stopTask = (tasks: Tasks, taskId: string, now: number): Tasks => finish(tasks, taskId, 'failed', now)

export const parseTaskNotifications = (text: string): TaskNotice[] => {
  const out: TaskNotice[] = []
  for (const m of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const body = m[1] ?? ''
    const tag = (n: string) => str(new RegExp(`<${n}>([^]*?)</${n}>`).exec(body)?.[1]?.trim())
    out.push({ taskId: tag('task-id'), toolUseId: tag('tool-use-id'), status: tag('status') })
  }
  return out
}

export const endTask = (tasks: Tasks, notice: TaskNotice, now: number): Tasks => {
  const status = notice.status === 'completed' ? 'done' : notice.status === 'failed' || notice.status === 'killed' ? 'failed' : undefined
  if (!status) return tasks
  const byId = notice.taskId === undefined ? undefined : tasks[notice.taskId]
  const hit = byId && isRunning(byId) ? byId : undefined
  const found = hit ?? (notice.toolUseId === undefined ? undefined : Object.values(tasks).find(k => isRunning(k) && k.toolUseId === notice.toolUseId))
  return found === undefined ? tasks : finish(tasks, found.id, status, now)
}

export const expireMonitors = (tasks: Tasks, now: number): Tasks => {
  let out = tasks
  for (const k of Object.values(tasks)) {
    if (k.kind === 'monitor' && isRunning(k) && k.timeoutMs !== undefined && k.timeoutMs > 0 && now >= k.startedAt + k.timeoutMs) {
      out = finish(out, k.id, 'done', k.startedAt + k.timeoutMs)
    }
  }
  return out
}

export const visibleTasks = (tasks: Tasks, since: number, everyone: boolean): BgTask[] =>
  Object.values(tasks)
    .filter(k => k.startedAt >= since && (everyone || isRunning(k)))
    .sort((a, b) => b.startedAt - a.startedAt)

export const dropEnded = (tasks: Tasks): Tasks => {
  const all = Object.entries(tasks)
  const live = all.filter(([, k]) => isRunning(k))
  return live.length === all.length ? tasks : Object.fromEntries(live)
}

export const statusLine = (agentPart: string | undefined, running: number, statusBg: (n: number) => string): string | undefined => {
  if (running <= 0) return agentPart
  return agentPart === undefined ? `⚙ ${statusBg(running)}` : `${agentPart} · ${statusBg(running)}`
}
