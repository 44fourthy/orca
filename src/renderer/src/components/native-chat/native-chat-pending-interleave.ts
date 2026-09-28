// Where optimistic "queued" sends render in the transcript. Kept beside — not
// inside — native-chat-pending.ts so the pending logic there stays under the
// file-length cap, and unit-testable without React.

import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatPendingSend } from './native-chat-pending'

/**
 * Where an echo belongs: the index of the transcript row it renders after, -1
 * for the head (every visible row is newer than the send), or null for the tail
 * when nothing orders it. The boundary id is exact while the row is still in
 * the bounded read; once it is paged out — routine in long sessions — the
 * boundary's transcript-clock timestamp still orders the echo against whatever
 * the window holds.
 */
function pendingEchoCutIndex(
  entry: NativeChatPendingSend,
  messages: readonly NativeChatMessage[]
): number | null {
  if (typeof entry.afterMessageId === 'string') {
    const index = messages.findIndex((message) => message.id === entry.afterMessageId)
    if (index !== -1) {
      return index
    }
  }
  if (typeof entry.afterMessageTimestamp === 'number') {
    const boundary = entry.afterMessageTimestamp
    let cut = -1
    let sawComparable = false
    messages.forEach((message, index) => {
      if (message.timestamp === null) {
        return
      }
      sawComparable = true
      if (message.timestamp <= boundary) {
        cut = index
      }
    })
    return sawComparable ? cut : null
  }
  return null
}

/**
 * Place each visible echo directly after the transcript row that was last
 * visible when it was sent, so rows that arrive after the send render *below*
 * the echo. Appending echoes at the list tail instead leaves a mid-turn send
 * pinned under the still-streaming previous turn, which reads as the reply
 * arriving above the message that was sent after it (stablyai/orca#22086).
 * Echoes nothing can order (no boundary at all) keep the tail placement.
 */
export function interleavePendingSends(
  pending: NativeChatPendingSend[],
  messages: readonly NativeChatMessage[],
  echoes: readonly NativeChatMessage[]
): NativeChatMessage[] {
  if (echoes.length === 0) {
    return [...messages]
  }
  const entryByEchoId = new Map(pending.map((entry) => [`pending:${entry.id}`, entry]))
  const echoesByCutIndex = new Map<number, NativeChatMessage[]>()
  const head: NativeChatMessage[] = []
  const tail: NativeChatMessage[] = []
  for (const echo of echoes) {
    const entry = entryByEchoId.get(echo.id)
    const cut = entry ? pendingEchoCutIndex(entry, messages) : null
    if (cut === null) {
      tail.push(echo)
    } else if (cut === -1) {
      head.push(echo)
    } else {
      const placed = echoesByCutIndex.get(cut)
      if (placed) {
        placed.push(echo)
      } else {
        echoesByCutIndex.set(cut, [echo])
      }
    }
  }
  const ordered: NativeChatMessage[] = [...head]
  messages.forEach((message, index) => {
    ordered.push(message)
    const placed = echoesByCutIndex.get(index)
    if (placed) {
      ordered.push(...placed)
    }
  })
  return [...ordered, ...tail]
}
