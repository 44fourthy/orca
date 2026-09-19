import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

/** Fork defaults (Albert Sans, chat UI on) and their one-shot migration on the web preload. */
describe('web settings preload API fork defaults', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('migrates a stored stock Geist font and chat-off defaults for web settings once', async () => {
    const globals = installBrowserGlobals('Linux')
    globals.storage.setItem(
      'orca.web.settings.v1',
      JSON.stringify({ appFontFamily: 'Geist', experimentalNativeChat: false })
    )
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    const settings = await globals.window.api.settings.get()
    const stored: Partial<GlobalSettings> = JSON.parse(
      globals.storage.getItem('orca.web.settings.v1') ?? '{}'
    )

    expect(settings.appFontFamily).toBe('Albert Sans')
    expect(settings.experimentalNativeChat).toBe(true)
    expect(settings.openAgentTabsInChatByDefault).toBe(true)
    expect(stored.appFontFamily).toBe('Albert Sans')
    expect(stored.appFontFamilyDefaultedToAlbertSans).toBe(true)
    expect(stored.experimentalNativeChat).toBe(true)
    expect(stored.nativeChatDefaultedOn).toBe(true)
  })

  it('keeps Geist and a chat opt-out chosen live through the web settings API', async () => {
    const globals = installBrowserGlobals('Linux')
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.settings.set({ appFontFamily: 'Geist' })
    const settings = await globals.window.api.settings.set({ experimentalNativeChat: false })

    expect(settings.appFontFamily).toBe('Geist')
    expect(settings.appFontFamilyDefaultedToAlbertSans).toBe(true)
    expect(settings.experimentalNativeChat).toBe(false)
    expect(settings.nativeChatDefaultedOn).toBe(true)

    const reread = await globals.window.api.settings.get()
    expect(reread.appFontFamily).toBe('Geist')
    expect(reread.experimentalNativeChat).toBe(false)
  })

  it('does not let a stock host reply turn the migrated chat defaults into a guarded opt-out', async () => {
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(): Promise<RuntimeRpcResponse<unknown>> {
          return Promise.resolve({
            id: 'call',
            ok: true,
            result: {
              settings: {
                compactWorktreeCards: true,
                experimentalNativeChat: false,
                openAgentTabsInChatByDefault: false,
                activeRuntimeEnvironmentId: 'host-internal-default'
              }
            },
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        close(): void {}
      }
    }))

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    const updated = await globals.window.api.settings.set({ compactWorktreeCards: true })
    const reread = await globals.window.api.settings.get()
    const stored: Partial<GlobalSettings> = JSON.parse(
      globals.storage.getItem('orca.web.settings.v1') ?? '{}'
    )

    expect(updated.compactWorktreeCards).toBe(true)
    expect(updated.experimentalNativeChat).toBe(true)
    expect(updated.openAgentTabsInChatByDefault).toBe(true)
    expect(reread.experimentalNativeChat).toBe(true)
    expect(stored.experimentalNativeChat).toBe(true)
    expect(stored.openAgentTabsInChatByDefault).toBe(true)
  }, 15_000)
})
