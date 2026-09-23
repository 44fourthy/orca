import { describe, expect, it } from 'vitest'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'
import {
  deriveNativeChatRowContent,
  nativeChatRowRendersContent
} from './native-chat-row-content'

function call(name: string): NativeChatBlock {
  return { type: 'tool-call', name, input: {} }
}

function result(): NativeChatBlock {
  return { type: 'tool-result', output: 'ok' }
}

describe('native chat row content — hidden tool activity', () => {
  it('draws nothing for a tool-only row when tool activity is hidden', () => {
    const blocks = [call('Read'), result()]
    expect(nativeChatRowRendersContent(blocks, { hideToolActivity: true })).toBe(false)
    expect(nativeChatRowRendersContent(blocks)).toBe(true)
  })

  it('keeps the assistant prose and drops the tools beside it', () => {
    const blocks: NativeChatBlock[] = [
      { type: 'text', text: 'Done — I fixed the button.' },
      call('Edit'),
      result()
    ]
    const hidden = deriveNativeChatRowContent(blocks, { hideToolActivity: true })
    expect(hidden.tools).toHaveLength(0)
    expect(hidden.markdown).toContain('fixed the button')
    expect(nativeChatRowRendersContent(blocks, { hideToolActivity: true })).toBe(true)

    const visible = deriveNativeChatRowContent(blocks)
    expect(visible.tools.length).toBeGreaterThan(0)
  })

  it('keeps one cache entry per flag so the two derivations never cross', () => {
    const blocks = [call('Read'), result()]
    const hidden = deriveNativeChatRowContent(blocks, { hideToolActivity: true })
    const visible = deriveNativeChatRowContent(blocks)
    expect(hidden.tools).toHaveLength(0)
    expect(visible.tools.length).toBeGreaterThan(0)
    // And again from cache, in the opposite order.
    expect(deriveNativeChatRowContent(blocks).tools.length).toBeGreaterThan(0)
    expect(deriveNativeChatRowContent(blocks, { hideToolActivity: true }).tools).toHaveLength(0)
  })
})
