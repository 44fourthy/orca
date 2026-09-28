import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { applyAppVariantWindowChrome, appVariantTitlebarCss } from './app-variant-titlebar'

const exe = (bundle: string): string => `/Applications/${bundle}/Contents/MacOS/Orca`

// Why: variants exist only in macOS bundles, and the unit shards run on Linux.
const originalPlatform = process.platform
beforeAll(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
})
afterAll(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
})

describe('appVariantTitlebarCss', () => {
  it('tints the titlebar and adds the accent strip for each branded bundle', () => {
    expect(appVariantTitlebarCss(exe('Orca Bara.app'))).toContain('#3b82f6')
    expect(appVariantTitlebarCss(exe('Orca LIF.app'))).toContain('#ec4899')
    expect(appVariantTitlebarCss(exe('Orca Colors.app'))).toContain('#8b5cf6')
    expect(appVariantTitlebarCss(exe('Orca Topline.app'))).toContain('#f97316')
    for (const bundle of ['Orca Bara.app', 'Orca LIF.app']) {
      const css = appVariantTitlebarCss(exe(bundle)) ?? ''
      expect(css).toContain('.titlebar, .titlebar-left')
      expect(css).toContain('html::after')
    }
  })

  it('leaves the default bundle and unknown variants untouched', () => {
    expect(appVariantTitlebarCss(exe('Orca.app'))).toBeNull()
    expect(appVariantTitlebarCss(exe('Orca Whatever.app'))).toBeNull()
  })
})

describe('applyAppVariantWindowChrome', () => {
  const fakeWindow = (): { window: BrowserWindow; on: ReturnType<typeof vi.fn> } => {
    const on = vi.fn()
    return {
      on,
      window: { webContents: { on }, isDestroyed: () => false } as unknown as BrowserWindow
    }
  }

  it('registers the injection on every load for a branded bundle', () => {
    const { window, on } = fakeWindow()
    applyAppVariantWindowChrome(window, exe('Orca LIF.app'))
    expect(on).toHaveBeenCalledWith('did-finish-load', expect.any(Function))
  })

  it('does nothing for the default bundle', () => {
    const { window, on } = fakeWindow()
    applyAppVariantWindowChrome(window, exe('Orca.app'))
    expect(on).not.toHaveBeenCalled()
  })
})
