import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

// Shapes copied from real Claude Code 2.1.x transcripts: a prompt submitted
// mid-turn is recorded only as a `queued_command` attachment.
function queued(attachment: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    parentUuid: 'b2091461-c825-4b3c-b6cf-c4c3e9bb2ef2',
    isSidechain: false,
    type: 'attachment',
    uuid: 'd987938a-f141-4d9a-a947-9d293a1f06bd',
    timestamp: '2026-09-28T11:52:52.597Z',
    attachment: { type: 'queued_command', timestamp: '2026-09-28T11:52:52.597Z', ...attachment },
    ...extra
  })
}

describe('decodeClaudeTranscriptLine — queued_command', () => {
  it('decodes a prompt the user sent mid-turn as a user row', () => {
    const message = decodeClaudeTranscriptLine(
      queued({
        prompt: 'also make the left rail narrower',
        commandMode: 'prompt',
        origin: { kind: 'human' },
        humanTurn: true,
        source_uuid: 'ade01ce7-e10e-4bb0-885b-6f016fe9cf6a'
      }),
      'fallback'
    )
    expect(message).toEqual({
      id: 'd987938a-f141-4d9a-a947-9d293a1f06bd',
      role: 'user',
      blocks: [{ type: 'text', text: 'also make the left rail narrower' }],
      timestamp: Date.parse('2026-09-28T11:52:52.597Z'),
      source: 'transcript'
    })
  })

  it('keeps a queued prompt whose content arrives as blocks', () => {
    const message = decodeClaudeTranscriptLine(
      queued({
        prompt: [{ type: 'text', text: 'see the screenshot' }],
        commandMode: 'prompt',
        origin: { kind: 'human' }
      }),
      'fallback'
    )
    expect(message?.role).toBe('user')
    expect(message?.blocks).toEqual([{ type: 'text', text: 'see the screenshot' }])
  })

  it('accepts an older record with no origin when the prompt is plain text', () => {
    const message = decodeClaudeTranscriptLine(
      queued({ prompt: 'We need to redesign the drawer', commandMode: 'prompt' }),
      'fallback'
    )
    expect(message?.role).toBe('user')
  })

  it('drops background-task notifications', () => {
    expect(
      decodeClaudeTranscriptLine(
        queued({
          prompt: '<task-notification>\n<task-id>bnuqu5o3f</task-id>\n</task-notification>',
          commandMode: 'task-notification'
        }),
        'fallback'
      )
    ).toBeNull()
  })

  it('drops messages from peer sessions and meta injections', () => {
    expect(
      decodeClaudeTranscriptLine(
        queued({
          prompt: 'Not mine — take the branch back.',
          commandMode: 'prompt',
          origin: { kind: 'peer' }
        }),
        'fallback'
      )
    ).toBeNull()
    expect(
      decodeClaudeTranscriptLine(
        queued({
          prompt: '<cross-session-message from="x">hi</cross-session-message>',
          commandMode: 'prompt',
          isMeta: true,
          origin: { kind: 'human' }
        }),
        'fallback'
      )
    ).toBeNull()
    expect(
      decodeClaudeTranscriptLine(
        queued({
          prompt: '<cross-session-message from="x">hi</cross-session-message>',
          commandMode: 'prompt'
        }),
        'fallback'
      )
    ).toBeNull()
  })

  it('still ignores every other attachment type', () => {
    const line = JSON.stringify({
      type: 'attachment',
      uuid: 'a1',
      timestamp: '2026-09-28T11:52:52.597Z',
      attachment: { type: 'hook_success', hookName: 'Stop' }
    })
    expect(decodeClaudeTranscriptLine(line, 'fallback')).toBeNull()
  })
})
