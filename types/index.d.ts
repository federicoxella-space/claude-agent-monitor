export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type AgentRow = {
  id: string
  description: string
  /** subagentType; vuoto finché agent.spawn non l'ha registrato (fork interni restano nascosti) */
  type: string
  model?: string
  effort?: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'thinking' | 'done' | 'failed'
  activity: string
  recent: { at: number; text: string }[]
  steps: number
  usage: Usage
  /** started with run_in_background */
  background?: boolean
}

export type BgTask = {
  id: string
  toolUseId: string
  kind: 'shell' | 'monitor'
  text: string
  agentId?: string
  startedAt: number
  endedAt?: number
  timeoutMs?: number
  status: 'running' | 'done' | 'failed'
}

declare module 'claude-code' {
  interface PluginState {
    'agent-monitor': {
      agents: Record<string, AgentRow>
      expanded: string | null
      tasks: Record<string, BgTask>
    }
  }
}
