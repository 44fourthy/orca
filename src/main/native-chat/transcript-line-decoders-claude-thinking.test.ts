import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

function line(content: unknown[]): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: 'u1',
    timestamp: '2026-09-23T13:01:27.000Z',
    message: { role: 'assistant', content }
  })
}

describe('claude transcript thinking blocks', () => {
  it('flags thinking text as reasoning so the chat can hide it', () => {
    const message = decodeClaudeTranscriptLine(
      line([{ type: 'thinking', thinking: 'Let me think about it.' }]),
      'fallback'
    )
    expect(message?.blocks).toEqual([
      { type: 'text', text: 'Let me think about it.', reasoning: true }
    ])
  })

  it('leaves plain assistant text unflagged', () => {
    const message = decodeClaudeTranscriptLine(line([{ type: 'text', text: 'Done.' }]), 'fallback')
    expect(message?.blocks).toEqual([{ type: 'text', text: 'Done.' }])
  })

  it('still drops redacted thinking (empty text) entirely', () => {
    const message = decodeClaudeTranscriptLine(
      line([{ type: 'thinking', thinking: '', signature: 'sig' }]),
      'fallback'
    )
    expect(message).toBeNull()
  })
})
