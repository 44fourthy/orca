import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import {
  CLAUDE_SEND_QUEUED_NOW_KEYS,
  claudeQueuedPendingIds,
  claudeQueuedPromptTexts
} from './native-chat-claude-queue'
import type { NativeChatPendingSend } from './native-chat-pending'
import type { NativeChatAgentQueue } from './native-chat-queue-context'
import { useNativeChatFailedDeliveryIds } from './use-native-chat-undelivered-sends'

export { NativeChatAgentQueueContext } from './native-chat-queue-context'

/** How often the agent screen is re-read while a send is still unconfirmed. */
const QUEUE_POLL_MS = 1000
/** Gap between the two keys of Claude's send-now chord. */
const SEND_NOW_CHORD_GAP_MS = 150

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

/**
 * Tracks which queued bubbles Claude is holding in its own prompt queue by
 * reading the agent screen, and exposes Claude's send-now chord. Polls only
 * while unconfirmed sends exist, so an idle chat does no work.
 */
export function useNativeChatClaudeQueue(args: {
  pending: readonly NativeChatPendingSend[]
  readTerminalScreen?: () => string | null
  targetPtyId: string | null
  terminalTabId: string
}): NativeChatAgentQueue {
  const { pending, readTerminalScreen, targetPtyId, terminalTabId } = args
  const [queuedIds, setQueuedIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (pending.length === 0 || !readTerminalScreen) {
      setQueuedIds((current) => (current.size === 0 ? current : new Set()))
      return
    }
    const read = (): void => {
      let next: ReadonlySet<string> = new Set()
      try {
        next = claudeQueuedPendingIds(pending, claudeQueuedPromptTexts(readTerminalScreen()))
      } catch {
        // An unreadable screen shows nothing as queued; the bubble keeps its default state.
      }
      setQueuedIds((current) => (sameIds(current, next) ? current : next))
    }
    read()
    const timer = setInterval(read, QUEUE_POLL_MS)
    return () => clearInterval(timer)
  }, [pending, readTerminalScreen])

  const sendNow = useCallback(() => {
    if (!targetPtyId) {
      return
    }
    const settings = getSettingsForAgentTabRuntimeOwner(terminalTabId)
    const [first, second] = CLAUDE_SEND_QUEUED_NOW_KEYS
    sendRuntimePtyInput(settings, targetPtyId, first)
    setTimeout(() => sendRuntimePtyInput(settings, targetPtyId, second), SEND_NOW_CHORD_GAP_MS)
  }, [targetPtyId, terminalTabId])

  return useMemo(() => ({ queuedIds, sendNow }), [queuedIds, sendNow])
}

/**
 * Delivery state for the chat's queued bubbles: which ones Claude is holding in
 * its own queue, and which never reached the agent. A send Claude is holding
 * was delivered — the agent just hasn't taken it yet — so it is never flagged.
 */
export function useNativeChatDelivery(
  delivery: {
    failedLaunchPromptMessageIds: ReadonlySet<string> | undefined
    pending: NativeChatPendingSend[]
    isWorking: boolean
  },
  target: {
    readTerminalScreen?: () => string | null
    targetPtyId: string | null
    terminalTabId: string
  }
): { failedDeliveryMessageIds: ReadonlySet<string> | undefined; agentQueue: NativeChatAgentQueue } {
  const { failedLaunchPromptMessageIds, pending, isWorking } = delivery
  const agentQueue = useNativeChatClaudeQueue({ pending, ...target })
  const unqueuedPending = useMemo(
    () => pending.filter((entry) => !agentQueue.queuedIds.has(`pending:${entry.id}`)),
    [pending, agentQueue.queuedIds]
  )
  const failedDeliveryMessageIds = useNativeChatFailedDeliveryIds(
    failedLaunchPromptMessageIds,
    unqueuedPending,
    isWorking
  )
  return { failedDeliveryMessageIds, agentQueue }
}
