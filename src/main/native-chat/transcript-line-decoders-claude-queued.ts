// Claude JSONL `queued_command` attachment → user message.
//
// Why: a prompt submitted while Claude is mid-turn is never written as a `user`
// record. Claude injects it into the running turn and records it only as an
// `attachment` of type `queued_command`. Decoding just user/assistant records
// made every mid-turn message vanish from the chat, and the composer's echo of
// it could never find its delivered row — so a delivered send was flagged
// "Not delivered — check the terminal" once the agent went idle.

import type { NativeChatMessage } from '../../shared/native-chat-types'
import { asRecord, extractString, timestampMs } from '../ai-vault/session-scanner-values'
import { claudeContentBlocks } from './transcript-record-blocks'
import { unwrapClaudePastedContentBlock } from '../../shared/claude-pasted-content'

/**
 * Only prompts a person submitted become user rows. Claude queues its own
 * traffic the same way — background-task notifications (`commandMode:
 * 'task-notification'`), meta injections, and messages from peer sessions
 * (`origin.kind: 'peer'`) — and those must stay out of the user bubble path.
 */
function isHumanQueuedPrompt(attachment: Record<string, unknown>, text: string): boolean {
  if (attachment.commandMode !== 'prompt' || attachment.isMeta === true) {
    return false
  }
  const origin = asRecord(attachment.origin)
  if (origin) {
    return origin.kind === 'human'
  }
  // Older records carry no origin; machine-injected prompts arrive wrapped in
  // an XML-style envelope (<task-notification>, <cross-session-message>, …).
  return attachment.humanTurn === true || !text.trimStart().startsWith('<')
}

export function decodeClaudeQueuedCommand(
  record: Record<string, unknown>,
  fallbackId: string
): NativeChatMessage | null {
  const attachment = asRecord(record.attachment)
  if (attachment?.type !== 'queued_command' || record.isMeta === true) {
    return null
  }
  const blocks = claudeContentBlocks(attachment.prompt)
  const text = blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')
  if (blocks.length === 0 || !isHumanQueuedPrompt(attachment, text)) {
    return null
  }
  const timestamp = timestampMs(attachment.timestamp ?? record.timestamp)
  return {
    id: extractString(record.uuid) ?? fallbackId,
    role: 'user',
    // Same unwrapping as a plain user record, so a queued paste reads like one.
    blocks: blocks.map(unwrapClaudePastedContentBlock),
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    source: 'transcript'
  }
}
