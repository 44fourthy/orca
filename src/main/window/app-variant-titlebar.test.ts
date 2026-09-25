import { describe, expect, it } from 'vitest'
import { appVariantTitlebarCss } from './app-variant-titlebar'

const exe = (bundle: string): string => `/Applications/${bundle}/Contents/MacOS/Orca`

describe('appVariantTitlebarCss', () => {
  it('tints the titlebar in the client color for each branded bundle', () => {
    expect(appVariantTitlebarCss(exe('Orca Bara.app'))).toContain('#3b82f6')
    expect(appVariantTitlebarCss(exe('Orca LIF.app'))).toContain('#ec4899')
    expect(appVariantTitlebarCss(exe('Orca Colors.app'))).toContain('#8b5cf6')
    expect(appVariantTitlebarCss(exe('Orca Topline.app'))).toContain('#f97316')
  })

  it('leaves the default bundle and unknown variants untouched', () => {
    expect(appVariantTitlebarCss(exe('Orca.app'))).toBeNull()
    expect(appVariantTitlebarCss(exe('Orca Whatever.app'))).toBeNull()
  })
})
