import { expect, test } from 'claude-code/testing'

import type { BgTask } from '../types'
import {
  dropEnded, endTask, expireMonitors, isRunning, parseTaskNotifications, statusLine, stopTask,
  stoppedTaskId, taskFromToolCall, visibleTasks,
} from './background'

const mk = (id: string, o: Partial<BgTask> = {}): BgTask => ({
  id, toolUseId: `tu-${id}`, kind: 'shell', text: id, startedAt: 1000, status: 'running', ...o,
})
const call = (tool: string, input: Record<string, unknown>) => ({ tool, toolUseId: 'tu1', input })

test('task from tool call: shell, monitor, and what creates nothing', () => {
  const sh = taskFromToolCall(call('Bash', { command: '  npm  run\n dev ' }), { result: { backgroundTaskId: 'b1' } }, 5)
  expect(sh).toEqual({ id: 'b1', toolUseId: 'tu1', agentId: undefined, kind: 'shell', text: 'npm run dev', startedAt: 5, status: 'running' })
  expect(taskFromToolCall(call('PowerShell', { command: 'ls' }), { result: { backgroundTaskId: 'p1' } }, 5)?.id).toBe('p1')
  const mon = taskFromToolCall({ ...call('Monitor', { description: 'Watch' }), agentId: 'a1' }, { result: { taskId: 'm1', timeoutMs: 60000 } }, 5)
  expect(mon?.kind).toBe('monitor')
  expect(mon?.text).toBe('Watch')
  expect(mon?.timeoutMs).toBe(60000)
  expect(mon?.agentId).toBe('a1')
  expect(taskFromToolCall(call('Monitor', { description: 'W' }), { result: { taskId: 'm2', timeoutMs: 0, persistent: true } }, 5)?.timeoutMs).toBe(undefined)
  expect(taskFromToolCall(call('Bash', { command: 'ls' }), { result: {} }, 5)).toBe(undefined)
  expect(taskFromToolCall(call('Bash', { command: 'ls' }), { result: { backgroundTaskId: '' } }, 5)).toBe(undefined)
  expect(taskFromToolCall(call('Bash', { command: 'ls' }), { deny: 'no', result: { backgroundTaskId: 'b' } }, 5)).toBe(undefined)
  expect(taskFromToolCall(call('Bash', { command: 'ls' }), { isError: true, result: { backgroundTaskId: 'b' } }, 5)).toBe(undefined)
  expect(taskFromToolCall(call('Read', {}), { result: { backgroundTaskId: 'b' } }, 5)).toBe(undefined)
  expect(taskFromToolCall(call('Bash', { command: 'ls' }), undefined, 5)).toBe(undefined)
})

test('parse notifications and end tasks', () => {
  const text = '<task-notification>\n<task-id> b1 </task-id>\n<tool-use-id>tu-b1</tool-use-id>\n<status>completed</status>\n</task-notification>\nx<task-notification><task-id>b2</task-id><status>killed</status></task-notification>'
  expect(parseTaskNotifications(text)).toEqual([
    { taskId: 'b1', toolUseId: 'tu-b1', status: 'completed' },
    { taskId: 'b2', toolUseId: undefined, status: 'killed' },
  ])
  expect(parseTaskNotifications('nothing')).toEqual([])

  const tasks: Record<string, BgTask> = { b1: mk('b1'), b2: mk('b2') }
  const done = endTask(tasks, { taskId: 'b1', status: 'completed' }, 9)
  expect(done.b1).toEqual({ ...tasks.b1, status: 'done', endedAt: 9 })
  expect(done.b2).toBe(tasks.b2)
  expect(endTask(tasks, { taskId: 'b2', status: 'failed' }, 9)['b2']?.status).toBe('failed')
  expect(endTask(tasks, { taskId: 'b2', status: 'killed' }, 9)['b2']?.status).toBe('failed')
  expect(endTask(tasks, { taskId: 'zzz', toolUseId: 'tu-b2', status: 'completed' }, 9)['b2']?.status).toBe('done')
  expect(endTask(tasks, { taskId: 'b1', status: 'running' }, 9)).toBe(tasks)
  expect(endTask(tasks, { taskId: 'b1' }, 9)).toBe(tasks)
  expect(endTask(tasks, { taskId: 'nope', status: 'completed' }, 9)).toBe(tasks)
  expect(endTask(done, { taskId: 'b1', status: 'failed' }, 99)).toBe(done)
})

test('stop', () => {
  expect(stoppedTaskId('TaskStop', { result: { task_id: 'b1' } })).toBe('b1')
  expect(stoppedTaskId('TaskStop', { isError: true, result: { task_id: 'b1' } })).toBe(undefined)
  expect(stoppedTaskId('Bash', { result: { task_id: 'b1' } })).toBe(undefined)
  expect(stoppedTaskId('TaskStop', { result: {} })).toBe(undefined)
  const tasks: Record<string, BgTask> = { b1: mk('b1') }
  expect(stopTask(tasks, 'b1', 7).b1).toEqual({ ...tasks.b1, status: 'failed', endedAt: 7 })
  expect(stopTask(tasks, 'zzz', 7)).toBe(tasks)
  const ended = stopTask(tasks, 'b1', 7)
  expect(stopTask(ended, 'b1', 8)).toBe(ended)
})

test('monitor deadline', () => {
  const tasks: Record<string, BgTask> = {
    m1: mk('m1', { kind: 'monitor', timeoutMs: 100 }),
    m2: mk('m2', { kind: 'monitor', timeoutMs: 0 }),
    s1: mk('s1', { timeoutMs: 100 }),
  }
  expect(expireMonitors(tasks, 1099)).toBe(tasks)
  const out = expireMonitors(tasks, 5000)
  expect(out.m1).toEqual({ ...tasks.m1, status: 'done', endedAt: 1100 })
  expect(out.m2).toBe(tasks.m2)
  expect(out.s1).toBe(tasks.s1)
  expect(expireMonitors(tasks, 1100)['m1']?.status).toBe('done')
})

test('visibility, drop ended, running', () => {
  const tasks: Record<string, BgTask> = {
    old: mk('old', { startedAt: 10 }),
    a: mk('a', { startedAt: 1000 }),
    b: mk('b', { startedAt: 2000, status: 'done', endedAt: 2500 }),
    c: mk('c', { startedAt: 3000 }),
  }
  expect(visibleTasks(tasks, 1000, false).map(k => k.id)).toEqual(['c', 'a'])
  expect(visibleTasks(tasks, 1000, true).map(k => k.id)).toEqual(['c', 'b', 'a'])
  expect(Object.keys(dropEnded(tasks)).sort()).toEqual(['a', 'c', 'old'])
  const live = { a: mk('a') }
  expect(dropEnded(live)).toBe(live)
  expect(isRunning(mk('a'))).toBe(true)
  expect(isRunning(mk('b', { status: 'done' }))).toBe(false)
})

test('status line', () => {
  const bg = (n: number) => `${n} bg`
  expect(statusLine('⚙ 1 agent · $0.03', 2, bg)).toBe('⚙ 1 agent · $0.03 · 2 bg')
  expect(statusLine(undefined, 2, bg)).toBe('⚙ 2 bg')
  expect(statusLine('⚙ 1 agent', 0, bg)).toBe('⚙ 1 agent')
  expect(statusLine(undefined, 0, bg)).toBe(undefined)
})
