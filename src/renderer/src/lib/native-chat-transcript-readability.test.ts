import { describe, expect, it } from 'vitest'
import { isNativeChatTranscriptLocalReadable } from './native-chat-transcript-readability'

describe('native chat transcript readability', () => {
  it('allows local, runtime-owned and user SSH hosts; only an unresolved host is unreadable', () => {
    expect(isNativeChatTranscriptLocalReadable(null)).toBe(true)
    expect(isNativeChatTranscriptLocalReadable('runtime-ssh-env-1')).toBe(true)
    // The fork reads a user SSH target's transcript over its relay.
    expect(isNativeChatTranscriptLocalReadable('ssh-target-1')).toBe(true)
    expect(isNativeChatTranscriptLocalReadable(undefined)).toBe(false)
  })
})
