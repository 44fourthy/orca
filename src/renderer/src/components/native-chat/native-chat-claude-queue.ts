// Reading Claude Code's own prompt queue off the agent screen.
//
// Why: a prompt sent while Claude works is held in Claude's queue until the
// next tool boundary (or "send now"). The transcript only records it once it is
// consumed, so until then the chat cannot tell "Claude has it" from "the send
// was lost". Claude draws its queue above the composer:
//
//   ❯ what is 2+2
//     ctrl+x ctrl+s to send now
//
// so the screen is the one place that state is observable. Verified against
// Claude Code 2.1.283.

import { stripScrollbackAnsi } from './native-chat-scrape-fallback'
import type { NativeChatPendingSend } from './native-chat-pending'

/** Claude's chord that sends the queue immediately (tool runs move to background). */
export const CLAUDE_SEND_QUEUED_NOW_KEYS = ['\x18', '\x13'] as const

const SEND_NOW_HINT = /ctrl\+x ctrl\+s to send now/i
const QUEUED_PROMPT_LINE = /^\s*❯\s?(.*)$/
/** A long or multi-line paste is shown collapsed, not as its text. */
const PASTED_TEXT_PLACEHOLDER = /^\[Pasted text #\d+/
const PROBE_CHARS = 24
const MIN_PROBE_CHARS = 3

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The prompts Claude is currently holding, oldest first. Empty unless the
 * send-now hint is on screen, so an ordinary transcript echo never reads as queued.
 */
export function claudeQueuedPromptTexts(screen: string | null | undefined): string[] {
  if (!screen) {
    return []
  }
  const lines = stripScrollbackAnsi(screen).split('\n')
  let hintIndex = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (SEND_NOW_HINT.test(lines[index]!)) {
      hintIndex = index
      break
    }
  }
  if (hintIndex === -1) {
    return []
  }
  const entries: string[] = []
  // Walking up, a wrapped prompt's continuation lines come before its ❯ line.
  let continuation: string[] = []
  for (let index = hintIndex - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    const prompt = QUEUED_PROMPT_LINE.exec(line)
    if (prompt) {
      entries.unshift(collapse([prompt[1]!, ...continuation].join(' ')))
      continuation = []
      continue
    }
    if (line.trim() === '') {
      continue
    }
    // Only an indented line can continue a prompt; anything else ends the queue.
    if (!/^\s/.test(line)) {
      break
    }
    continuation.unshift(line)
  }
  return entries.filter((entry) => entry.length > 0)
}

function queuedEntryShowsText(entry: string, text: string): boolean {
  const probe = entry.slice(0, PROBE_CHARS)
  const shown = collapse(text)
  return probe.length >= MIN_PROBE_CHARS && shown.startsWith(probe)
}

/**
 * Pending sends Claude has visibly queued, as their row ids (`pending:<id>`).
 * Text entries match by prefix; collapsed-paste placeholders go to the oldest
 * sends no text entry claimed, in order.
 */
export function claudeQueuedPendingIds(
  pending: readonly NativeChatPendingSend[],
  queuedTexts: readonly string[]
): ReadonlySet<string> {
  const ids = new Set<string>()
  if (pending.length === 0 || queuedTexts.length === 0) {
    return ids
  }
  const oldestFirst = [...pending].sort((a, b) => a.sentAt - b.sentAt)
  let placeholders = 0
  for (const entry of queuedTexts) {
    if (PASTED_TEXT_PLACEHOLDER.test(entry)) {
      placeholders += 1
      continue
    }
    const match = oldestFirst.find(
      (send) => !ids.has(`pending:${send.id}`) && queuedEntryShowsText(entry, send.text)
    )
    if (match) {
      ids.add(`pending:${match.id}`)
    }
  }
  for (const send of oldestFirst) {
    if (placeholders === 0) {
      break
    }
    if (!ids.has(`pending:${send.id}`)) {
      ids.add(`pending:${send.id}`)
      placeholders -= 1
    }
  }
  return ids
}
