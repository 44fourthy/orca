// Rendering support for the working turn's trailing prose. With tool activity
// hidden, the agent's newest prose is all the transcript shows while it works —
// but that text is progress talk ("let me stop trusting the script…"), not the
// answer, so it renders as a small narration line instead of a full message.

import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'
import { deriveNativeChatRowContent } from '../../../../shared/native-chat-row-content'

/**
 * The first `limit` sentences of a narration line, ellipsized when cut.
 * `.`/`!`/`?`/`…` followed by whitespace ends a sentence; a newline does too, so
 * multi-line progress talk collapses to its openings.
 */
export function firstSentences(text: string, limit = 2): string {
  const sentences = text
    .split(/(?<=[.!?…])[ \t]+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
  if (sentences.length <= limit) {
    return text.trim()
  }
  return `${sentences.slice(0, limit).join(' ')}…`
}

/**
 * The id of the working turn's trailing prose row, or undefined. Rows that draw
 * nothing under the hide rules are skipped; the synthetic streaming preview is
 * skipped too (it is the live text, styled on its own); a user row ends the
 * walk. Only meaningful while the turn is working — once it settles the row is
 * the answer, not narration, and disappears from this list.
 */
export function nativeChatNarrationMessageId(
  messages: readonly NativeChatMessage[],
  hideToolActivity: boolean,
  isWorking: boolean
): string | undefined {
  if (!hideToolActivity || !isWorking) {
    return undefined
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role === 'user') {
      return undefined
    }
    if (message.role !== 'assistant' || message.id === NATIVE_CHAT_STREAMING_ID) {
      continue
    }
    const content = deriveNativeChatRowContent(message.blocks, { hideToolActivity: true })
    if (content.markdown.length > 0 || content.hasImages) {
      return message.id
    }
  }
  return undefined
}
