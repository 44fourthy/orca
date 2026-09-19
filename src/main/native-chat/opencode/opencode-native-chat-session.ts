import { parseExecutionHostId } from '../../../shared/execution-host'
import type { NativeChatMessage, NativeChatTurnLifecycle } from '../../../shared/native-chat-types'
import type { OpenCodeSessionWindow } from '../../../shared/opencode-session-window'
import type {
  NativeChatTranscriptSubscription,
  SubscribeNativeChatTranscriptArgs
} from '../transcript-watch-contract'
import { decodeOpenCodeSessionWindow } from './opencode-session-decoder'
import { readLocalOpenCodeSessionWindow } from './opencode-local-session-window'
import {
  readRemoteOpenCodeSessionWindow,
  type OpenCodeSessionWindowRequest
} from './opencode-remote-session-window'

export const OPENCODE_NATIVE_CHAT_POLL_MS = 1_000
const OPENCODE_NATIVE_CHAT_MISSING_MESSAGE = 'Transcript unavailable'

export type OpenCodeNativeChatReadArgs = {
  sessionId: string
  limit: number
  /** Where OpenCode runs; an `ssh:` host reads the database over its relay. */
  executionHostId?: string
}

export type OpenCodeNativeChatReadResult =
  | {
      messages: NativeChatMessage[]
      lifecycle?: NativeChatTurnLifecycle
      hasMore: boolean
      beforeOffset: number
    }
  | { error: string; notFound?: true }

function readWindow(
  args: OpenCodeNativeChatReadArgs,
  request: OpenCodeSessionWindowRequest,
  signal?: AbortSignal
): Promise<OpenCodeSessionWindow | null> {
  const host = parseExecutionHostId(args.executionHostId)
  if (host?.kind === 'ssh') {
    return readRemoteOpenCodeSessionWindow(host.targetId, request, signal)
  }
  return readLocalOpenCodeSessionWindow(request)
}

function decode(
  window: OpenCodeSessionWindow
): Exclude<OpenCodeNativeChatReadResult, { error: string }> {
  const decoded = decodeOpenCodeSessionWindow(window)
  const shown = window.messages.length
  return {
    messages: decoded.messages,
    ...(decoded.lifecycle ? { lifecycle: decoded.lifecycle } : {}),
    hasMore: window.totalMessages > shown,
    beforeOffset: Math.max(0, window.totalMessages - shown)
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function readOpenCodeNativeChatSession(
  args: OpenCodeNativeChatReadArgs,
  signal?: AbortSignal
): Promise<OpenCodeNativeChatReadResult> {
  const sessionId = args.sessionId.trim()
  if (!sessionId) {
    return { error: OPENCODE_NATIVE_CHAT_MISSING_MESSAGE, notFound: true }
  }
  try {
    const window = await readWindow(args, { sessionId, limit: args.limit }, signal)
    if (!window) {
      return { error: OPENCODE_NATIVE_CHAT_MISSING_MESSAGE, notFound: true }
    }
    return decode(window)
  } catch (error) {
    signal?.throwIfAborted()
    return { error: errorText(error) }
  }
}

/**
 * Live view of an OpenCode session. There is no file to watch, so the loop polls
 * the session's change token once a second and republishes the whole window as a
 * `replacement` when it moves — parts are updated in place while the agent
 * streams, so append semantics would show stale text.
 */
export async function subscribeOpenCodeNativeChatSession(
  args: SubscribeNativeChatTranscriptArgs & { executionHostId?: string; pollIntervalMs?: number },
  signal?: AbortSignal
): Promise<NativeChatTranscriptSubscription> {
  const sessionId = args.sessionId.trim()
  const limit = args.initialLimit && args.initialLimit > 0 ? Math.floor(args.initialLimit) : 300
  const readArgs: OpenCodeNativeChatReadArgs = {
    sessionId,
    limit,
    executionHostId: args.executionHostId
  }
  let closed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastToken: string | null = null
  let pendingAnnounced = false
  let errorAnnounced: string | null = null

  try {
    const window = sessionId ? await readWindow(readArgs, { sessionId, limit }, signal) : null
    if (signal?.aborted) {
      return { unsubscribe: () => {}, watching: false }
    }
    if (!window) {
      pendingAnnounced = true
      args.onTranscriptPending?.()
    } else {
      lastToken = window.changeToken
      const decoded = decode(window)
      args.onInitialSnapshot?.(
        decoded.messages,
        decoded.hasMore,
        decoded.beforeOffset,
        undefined,
        decoded.lifecycle
      )
    }
  } catch (error) {
    signal?.throwIfAborted()
    errorAnnounced = errorText(error)
    args.onInitialSnapshot?.([], false, 0, errorAnnounced)
  }

  const tick = async (): Promise<void> => {
    if (closed) {
      return
    }
    try {
      const probe = await readWindow(readArgs, { sessionId, limit, tokenOnly: true })
      if (closed) {
        return
      }
      if (!probe) {
        if (!pendingAnnounced) {
          pendingAnnounced = true
          args.onTranscriptPending?.()
        }
        return
      }
      if (probe.changeToken === lastToken) {
        return
      }
      const window = await readWindow(readArgs, { sessionId, limit })
      if (closed || !window) {
        return
      }
      lastToken = window.changeToken
      errorAnnounced = null
      const decoded = decode(window)
      args.onReplace?.(decoded.messages, decoded.hasMore, decoded.beforeOffset, decoded.lifecycle)
    } catch (error) {
      if (closed) {
        return
      }
      // A host that cannot answer is reported once and retried; never treated as absent.
      const message = errorText(error)
      if (errorAnnounced !== message) {
        errorAnnounced = message
        args.onInitialSnapshot?.([], false, 0, message)
      }
    } finally {
      if (!closed) {
        timer = setTimeout(() => void tick(), args.pollIntervalMs ?? OPENCODE_NATIVE_CHAT_POLL_MS)
        timer.unref?.()
      }
    }
  }
  timer = setTimeout(() => void tick(), args.pollIntervalMs ?? OPENCODE_NATIVE_CHAT_POLL_MS)
  timer.unref?.()
  const unsubscribe = (): void => {
    closed = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  signal?.addEventListener('abort', unsubscribe, { once: true })
  return { unsubscribe, watching: true }
}
