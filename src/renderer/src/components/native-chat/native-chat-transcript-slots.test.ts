import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatTurnStatus } from '../../../../shared/native-chat-turn-status'
import type { NativeChatResolvedPrompt } from './native-chat-resolution-receipt'
import type { NativeChatTurnDiff } from './native-chat-turn-diffs'
import {
  buildNativeChatTranscriptSlots,
  nativeChatSlotIndexOf
} from './native-chat-transcript-slots'

const NO_STATUSES = { active: null, completedByTurn: {} }

function text(id: string, body: string, role: NativeChatMessage['role'] = 'assistant') {
  return {
    id,
    role,
    blocks: [{ type: 'text' as const, text: body }],
    timestamp: 1,
    source: 'transcript' as const
  }
}

function build(
  messages: NativeChatMessage[],
  overrides: Partial<Parameters<typeof buildNativeChatTranscriptSlots>[0]> = {}
) {
  let turn: string | undefined
  const turnKeys = messages.map((message) => {
    if (message.role === 'user') {
      turn = message.id
    }
    return turn
  })
  return buildNativeChatTranscriptSlots({
    messages,
    turnKeys,
    latestUserIndex: messages.findLastIndex((message) => message.role === 'user'),
    currentTurnKey: undefined,
    receipts: new Map<string, NativeChatResolvedPrompt>(),
    turnStatuses: NO_STATUSES,
    turnDiffs: new Map<string, NativeChatTurnDiff>(),
    showTurnStatus: true,
    expandedTurnKeys: new Set<string>(),
    isWorking: false,
    lifecycleWorking: false,
    ...overrides
  })
}

describe('transcript slots', () => {
  // A counted row that draws nothing is a gap in the transcript: it reserves
  // estimated height for a bubble that never appears.
  it('gives a tool-only row no slot when tool activity is hidden', () => {
    const toolOnly: NativeChatMessage = {
      id: 'tool',
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'Read', input: {} }],
      timestamp: 1,
      source: 'transcript'
    }
    const messages = [text('u', 'do the thing', 'user'), text('a', 'done'), toolOnly]

    const visible = build(messages)
    expect(visible.map((slot) => slot.message.id)).toContain('tool')

    // Hidden activity draws nothing, and a counted row that draws nothing is a
    // gap in the transcript — so it must take no slot at all.
    const hidden = build(messages, { hideToolActivity: true })
    expect(hidden.map((slot) => slot.message.id)).toEqual(['u', 'a'])
  })

  it('keeps only the turn’s final prose when tool activity is hidden', () => {
    const commentary: NativeChatMessage = {
      id: 'note',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'Before I delete anything, let me check what dev and prod are.' }],
      timestamp: 1,
      source: 'transcript'
    }
    const tool: NativeChatMessage = {
      id: 'tool',
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'Bash', input: {} }],
      timestamp: 1,
      source: 'transcript'
    }
    const messages = [
      text('u', 'consolidate the branches', 'user'),
      commentary,
      tool,
      text('a', 'Verified from three sources — prod is safe to delete.')
    ]

    expect(build(messages).map((slot) => slot.message.id)).toEqual(['u', 'note', 'tool', 'a'])
    expect(build(messages, { hideToolActivity: true }).map((slot) => slot.message.id)).toEqual([
      'u',
      'a'
    ])
  })

  it('gives a reasoning row no slot when tool activity is hidden', () => {
    const reasoning: NativeChatMessage = {
      id: 'r',
      role: 'reasoning',
      blocks: [{ type: 'text', text: 'Let me think about which process owns port 5000.' }],
      timestamp: 1,
      source: 'transcript'
    }
    const messages = [text('u', 'kill the server', 'user'), reasoning, text('a', 'Done.')]

    expect(build(messages).map((slot) => slot.message.id)).toContain('r')
    expect(build(messages, { hideToolActivity: true }).map((slot) => slot.message.id)).toEqual([
      'u',
      'a'
    ])
  })

  it('gives no slot to a message with nothing to draw', () => {
    const slots = build([text('a', 'visible'), text('blank', ''), text('b', 'also visible')])
    expect(slots.map((slot) => slot.message.id)).toEqual(['a', 'b'])
  })

  it('keeps a message whose only content is a turn status under it', () => {
    const status: NativeChatTurnStatus = { startedAt: 1, thinking: false, workedSeconds: 4 }
    const slots = build([text('u', '', 'user')], {
      latestUserIndex: 0,
      turnStatuses: { active: status, completedByTurn: {} }
    })
    expect(slots).toHaveLength(1)
    expect(slots[0]?.status).toBe(status)
  })

  it('keeps a message whose only content is its turn diff rollup', () => {
    const diff: NativeChatTurnDiff = { files: [], added: 1, removed: 0, truncated: false }
    const slots = build([text('u', 'ask', 'user'), text('blank', '')], {
      turnDiffs: new Map([['u', diff]])
    })
    expect(slots.map((slot) => slot.message.id)).toEqual(['u', 'blank'])
    expect(slots[1]?.turnDiff).toBe(diff)
  })

  it('keeps a resolved prompt that stands in for a message drawing nothing', () => {
    const receipt = {
      kind: 'approval',
      title: 'Run it?',
      resolution: { state: 'resolved', selectedOptionId: 'yes' }
    } as unknown as NativeChatResolvedPrompt
    const slots = build([text('blank', '')], { receipts: new Map([['blank', receipt]]) })
    expect(slots).toHaveLength(1)
    expect(slots[0]?.receipt).toBe(receipt)
  })

  it('leaves the running turn status to the single transcript-tail indicator', () => {
    const status: NativeChatTurnStatus = { startedAt: 1, thinking: false, workedSeconds: null }
    const slots = build([text('u', 'ask', 'user')], {
      latestUserIndex: 0,
      turnStatuses: { active: status, completedByTurn: {} },
      isWorking: true
    })
    expect(slots[0]?.status).toBeUndefined()
  })

  it('reserves a height for every slot it keeps', () => {
    for (const slot of build([text('a', 'one'), text('b', 'two\nlines')])) {
      expect(slot.estimatedHeight).toBeGreaterThan(0)
    }
  })

  it('finds the slot a reveal names, and reports -1 for one that has no slot', () => {
    const slots = build([text('a', 'visible'), text('blank', ''), text('b', 'also visible')])
    expect(nativeChatSlotIndexOf(slots, 'b')).toBe(1)
    expect(nativeChatSlotIndexOf(slots, 'blank')).toBe(-1)
    expect(nativeChatSlotIndexOf(slots, undefined)).toBe(-1)
  })
})
