import type { GlobalSettings } from './global-settings-types'

type NativeChatDefaultSettings = Pick<
  GlobalSettings,
  | 'experimentalNativeChat'
  | 'openAgentTabsInChatByDefault'
  | 'experimentalStructuredNativeChat'
  | 'nativeChatDefaultedOn'
>

export function normalizeNativeChatDefaultOn(
  settings: Partial<NativeChatDefaultSettings> | undefined,
  options: { preserveExplicitValue?: boolean } = {}
): NativeChatDefaultSettings {
  const defaultedOn =
    settings?.nativeChatDefaultedOn === true || options.preserveExplicitValue === true

  // Why: a stock profile that had Chat UI off could still hold a dormant structured
  // opt-in; turning chat on must not silently wake that runtime as well.
  const structured =
    !defaultedOn &&
    settings?.experimentalNativeChat === false &&
    settings?.experimentalStructuredNativeChat === true
      ? false
      : settings?.experimentalStructuredNativeChat
  return {
    // Why: stock profiles persisted the former `false` defaults; only guarded
    // profiles or live user updates represent an intentional opt-out.
    experimentalNativeChat: defaultedOn ? (settings?.experimentalNativeChat ?? true) : true,
    openAgentTabsInChatByDefault: defaultedOn
      ? (settings?.openAgentTabsInChatByDefault ?? true)
      : true,
    ...(structured === undefined ? {} : { experimentalStructuredNativeChat: structured }),
    nativeChatDefaultedOn: true
  }
}
