import { describe, expect, it } from 'vitest'
import { claudeQueuedPendingIds, claudeQueuedPromptTexts } from './native-chat-claude-queue'
import type { NativeChatPendingSend } from './native-chat-pending'

const RULE = '─'.repeat(60)

// Captured from Claude Code 2.1.283 with one prompt queued behind a running tool.
const QUEUED_SCREEN = [
  '❯ Run the bash command sleep 40 and then reply with only the word DONE.',
  '',
  '● Waiting 40 seconds',
  '  ⎿  $ sleep 40 (13s)',
  '     (ctrl+b ctrl+b (twice) to run in background)',
  '',
  '❯ what is 2+2',
  '  ctrl+x ctrl+s to send now',
  '',
  '✽ Generating… (15s · ↓ 80 tokens)',
  RULE,
  '❯ Press up to edit queued messages',
  RULE,
  '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents'
].join('\n')

function send(id: string, text: string, sentAt: number): NativeChatPendingSend {
  return { id, text, sentAt }
}

describe('claudeQueuedPromptTexts', () => {
  it('reads the prompt Claude is holding, not the submitted one above it', () => {
    expect(claudeQueuedPromptTexts(QUEUED_SCREEN)).toEqual(['what is 2+2'])
  })

  it('reads several queued prompts and joins wrapped continuation lines', () => {
    const screen = [
      '● Working on it',
      '❯ first queued message',
      '❯ a second one that is long enough to',
      '  wrap onto the next line',
      '  ctrl+x ctrl+s to send now',
      RULE,
      '❯ ',
      RULE
    ].join('\n')
    expect(claudeQueuedPromptTexts(screen)).toEqual([
      'first queued message',
      'a second one that is long enough to wrap onto the next line'
    ])
  })

  it('sees nothing queued without the send-now hint', () => {
    expect(claudeQueuedPromptTexts(['❯ what is 2+2', RULE, '❯ ', RULE].join('\n'))).toEqual([])
    expect(claudeQueuedPromptTexts(null)).toEqual([])
  })
})

describe('claudeQueuedPendingIds', () => {
  it('flags the pending send whose text Claude is holding', () => {
    const pending = [send('a', 'what is 2+2', 2), send('b', 'unrelated follow-up', 3)]
    expect([...claudeQueuedPendingIds(pending, ['what is 2+2'])]).toEqual(['pending:a'])
  })

  it('gives collapsed-paste placeholders to the oldest unclaimed sends', () => {
    const pending = [send('new', 'short', 5), send('old', 'line one\nline two', 1)]
    expect([...claudeQueuedPendingIds(pending, ['[Pasted text #1 +1 lines]'])]).toEqual([
      'pending:old'
    ])
  })

  it('does not let one queued entry claim two identical sends', () => {
    const pending = [send('a', 'status?', 1), send('b', 'status?', 2)]
    expect([...claudeQueuedPendingIds(pending, ['status?'])]).toEqual(['pending:a'])
  })

  it('flags nothing when nothing is queued', () => {
    expect(claudeQueuedPendingIds([send('a', 'hi there', 1)], []).size).toBe(0)
  })
})
