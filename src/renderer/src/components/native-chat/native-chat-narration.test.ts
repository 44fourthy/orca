import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { firstSentences, nativeChatNarrationMessageId } from './native-chat-narration'

function prose(id: string, text: string, role: 'assistant' | 'user' = 'assistant'): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: 1, source: 'transcript' }
}

function toolCall(id: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'tool-call', name: 'Read', input: {} }],
    timestamp: 1,
    source: 'transcript'
  }
}

describe('firstSentences', () => {
  it('keeps a short line whole', () => {
    expect(firstSentences('One sentence only.')).toBe('One sentence only.')
  })

  it('keeps exactly two sentences whole', () => {
    expect(firstSentences('First. Second.')).toBe('First. Second.')
  })

  it('caps a longer line at two sentences with an ellipsis', () => {
    expect(firstSentences('First one. Second one. Third one.')).toBe('First one. Second one.…')
  })

  it('treats a newline as a sentence break', () => {
    expect(firstSentences('First line\nSecond line\nThird line')).toBe('First line Second line…')
  })
})

describe('nativeChatNarrationMessageId', () => {
  it('returns undefined when the mode is off or the turn is settled', () => {
    const messages = [prose('m1', 'working on it.')]
    expect(nativeChatNarrationMessageId(messages, false, true)).toBeUndefined()
    expect(nativeChatNarrationMessageId(messages, true, false)).toBeUndefined()
  })

  it('picks the trailing prose row of the working turn', () => {
    const messages = [
      prose('user-1', 'do the thing', 'user'),
      prose('m1', 'Let me check. First I look at the file.'),
      toolCall('tool-1')
    ]
    expect(nativeChatNarrationMessageId(messages, true, true)).toBe('m1')
  })

  it('stops at a user row rather than narrating the settled turn', () => {
    const messages = [prose('user-1', 'do the thing', 'user')]
    expect(nativeChatNarrationMessageId(messages, true, true)).toBeUndefined()
  })

  it('skips a trailing tool-only row and narrates nothing when no prose remains', () => {
    const messages = [prose('user-1', 'do the thing', 'user'), toolCall('tool-1')]
    expect(nativeChatNarrationMessageId(messages, true, true)).toBeUndefined()
  })

  it('skips a trailing tool-only row to reach the prose behind it', () => {
    const messages = [
      prose('user-1', 'do the thing', 'user'),
      prose('m1', 'Let me check the file.'),
      toolCall('tool-1')
    ]
    expect(nativeChatNarrationMessageId(messages, true, true)).toBe('m1')
  })
})
