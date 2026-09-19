import type { AgentType } from '../../../../shared/native-chat-types'
import type { NativeChatSubscribeArgs } from '../../../../preload/api/native-chat-api'
import type { NativeChatSessionTransport } from './native-chat-session-transport'

export type NativeChatSessionReadTarget = {
  agent: AgentType
  sessionId: string
  transcriptPath?: string | null
  executionHostId?: string | null
}

/** One page of a session's transcript through whichever transport owns it. */
export function readNativeChatSessionPage(
  transport: NativeChatSessionTransport,
  target: NativeChatSessionReadTarget,
  limit: number
): ReturnType<NativeChatSessionTransport['readSession']> {
  return transport.readSession(
    target.agent,
    target.sessionId,
    limit,
    target.transcriptPath ?? undefined,
    target.executionHostId ?? undefined
  )
}

/** The subscribe args for one session, minted under `subscriptionId`. */
export function nativeChatSubscribeArgs(
  subscriptionId: string,
  target: NativeChatSessionReadTarget,
  limit: number
): NativeChatSubscribeArgs {
  return {
    subscriptionId,
    agent: target.agent,
    sessionId: target.sessionId,
    transcriptPath: target.transcriptPath ?? undefined,
    executionHostId: target.executionHostId ?? undefined,
    limit
  }
}

/** Identity of a pane's transcript source; a change means pagination state is stale. */
export function nativeChatSessionSourceKey(target: {
  paneKey: string
  runtimeEnvironmentId?: string | null
  executionHostId?: string | null
  agent: AgentType
  sessionId: string | null
  transcriptPath?: string | null
}): string {
  return JSON.stringify([
    target.paneKey,
    target.runtimeEnvironmentId ?? null,
    target.executionHostId ?? null,
    target.agent,
    target.sessionId,
    target.transcriptPath ?? null
  ])
}
