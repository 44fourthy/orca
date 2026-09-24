import { useEffect, useMemo, useState } from 'react'
import {
  PENDING_SEND_NOT_DELIVERED_MS,
  type NativeChatPendingSend
} from './native-chat-pending'

/**
 * Row ids to mark "not delivered": a queued echo that outlives the agent's work
 * never reached it — the delayed Enter typed into the TUI can miss while it is
 * mid-render (stablyai/orca#14308). A timer arms for the moment the oldest open
 * echo passes the grace window, so an idle pane still surfaces the warning
 * without waiting for another session update. Includes the launch prompt's own
 * failure id when one is set.
 */
export function useNativeChatFailedDeliveryIds(
  launchFailedIds: ReadonlySet<string> | undefined,
  pending: NativeChatPendingSend[],
  isWorking: boolean
): ReadonlySet<string> | undefined {
  const [undeliveredIds, setUndeliveredIds] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    if (isWorking || pending.length === 0) {
      setUndeliveredIds((current) => (current.size === 0 ? current : new Set()))
      return
    }
    const now = Date.now()
    const due = pending.filter((entry) => now - entry.sentAt >= PENDING_SEND_NOT_DELIVERED_MS)
    if (due.length > 0) {
      setUndeliveredIds(new Set(due.map((entry) => `pending:${entry.id}`)))
      return
    }
    const dueAt = Math.min(...pending.map((entry) => entry.sentAt)) + PENDING_SEND_NOT_DELIVERED_MS
    const timer = setTimeout(
      () => setUndeliveredIds(new Set(pending.map((entry) => `pending:${entry.id}`))),
      Math.max(0, dueAt - now)
    )
    return () => clearTimeout(timer)
  }, [isWorking, pending])
  return useMemo(() => {
    const failed = new Set(launchFailedIds)
    for (const id of undeliveredIds) {
      failed.add(id)
    }
    return failed.size > 0 ? failed : undefined
  }, [launchFailedIds, undeliveredIds])
}
