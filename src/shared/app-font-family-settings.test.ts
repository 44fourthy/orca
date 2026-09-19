import { describe, expect, it } from 'vitest'
import { normalizeAppFontFamilyDefault, STOCK_APP_FONT_FAMILY } from './app-font-family-settings'
import { DEFAULT_APP_FONT_FAMILY } from './constants'

describe('normalizeAppFontFamilyDefault', () => {
  it('replaces the stock default a legacy profile persisted', () => {
    expect(normalizeAppFontFamilyDefault({ appFontFamily: STOCK_APP_FONT_FAMILY })).toEqual({
      appFontFamily: DEFAULT_APP_FONT_FAMILY,
      appFontFamilyDefaultedToAlbertSans: true
    })
  })

  it('fills an absent or blank font with the default', () => {
    expect(normalizeAppFontFamilyDefault(undefined).appFontFamily).toBe(DEFAULT_APP_FONT_FAMILY)
    expect(normalizeAppFontFamilyDefault({ appFontFamily: '  ' }).appFontFamily).toBe(
      DEFAULT_APP_FONT_FAMILY
    )
  })

  it('passes any other stored font through unchanged, whitespace included', () => {
    expect(normalizeAppFontFamilyDefault({ appFontFamily: 'Inter' })).toEqual({
      appFontFamily: 'Inter',
      appFontFamilyDefaultedToAlbertSans: true
    })
    expect(normalizeAppFontFamilyDefault({ appFontFamily: ' Inter ' }).appFontFamily).toBe(
      ' Inter '
    )
  })

  it('keeps the stock font once the profile is guarded or the user picks it live', () => {
    expect(
      normalizeAppFontFamilyDefault({
        appFontFamily: STOCK_APP_FONT_FAMILY,
        appFontFamilyDefaultedToAlbertSans: true
      }).appFontFamily
    ).toBe(STOCK_APP_FONT_FAMILY)
    expect(
      normalizeAppFontFamilyDefault(
        { appFontFamily: STOCK_APP_FONT_FAMILY },
        { preserveExplicitValue: true }
      ).appFontFamily
    ).toBe(STOCK_APP_FONT_FAMILY)
  })
})
