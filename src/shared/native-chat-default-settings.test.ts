import { describe, expect, it } from 'vitest'
import { normalizeNativeChatDefaultOn } from './native-chat-default-settings'

describe('normalizeNativeChatDefaultOn', () => {
  it('turns both chat defaults on for a legacy profile that persisted false', () => {
    expect(
      normalizeNativeChatDefaultOn({
        experimentalNativeChat: false,
        openAgentTabsInChatByDefault: false
      })
    ).toEqual({
      experimentalNativeChat: true,
      openAgentTabsInChatByDefault: true,
      nativeChatDefaultedOn: true
    })
  })

  it('keeps a dormant structured opt-in asleep when the migration turns chat on', () => {
    expect(
      normalizeNativeChatDefaultOn({
        experimentalNativeChat: false,
        experimentalStructuredNativeChat: true
      }).experimentalStructuredNativeChat
    ).toBe(false)
    // A live structured opt-in was reachable, so it survives.
    expect(
      normalizeNativeChatDefaultOn({
        experimentalNativeChat: true,
        experimentalStructuredNativeChat: true
      }).experimentalStructuredNativeChat
    ).toBe(true)
    expect(normalizeNativeChatDefaultOn(undefined)).not.toHaveProperty(
      'experimentalStructuredNativeChat'
    )
  })

  it('fills absent settings with on', () => {
    expect(normalizeNativeChatDefaultOn(undefined)).toEqual({
      experimentalNativeChat: true,
      openAgentTabsInChatByDefault: true,
      nativeChatDefaultedOn: true
    })
  })

  it('preserves an opt-out once the profile is guarded or the user toggles live', () => {
    expect(
      normalizeNativeChatDefaultOn({
        experimentalNativeChat: false,
        openAgentTabsInChatByDefault: true,
        nativeChatDefaultedOn: true
      })
    ).toEqual({
      experimentalNativeChat: false,
      openAgentTabsInChatByDefault: true,
      nativeChatDefaultedOn: true
    })
    expect(
      normalizeNativeChatDefaultOn(
        { experimentalNativeChat: true, openAgentTabsInChatByDefault: false },
        { preserveExplicitValue: true }
      ).openAgentTabsInChatByDefault
    ).toBe(false)
  })
})
