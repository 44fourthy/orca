import { DEFAULT_APP_FONT_FAMILY } from './constants'
import type { GlobalSettings } from './global-settings-types'

/** Stock Orca's interface font, which its profiles persisted as if chosen. */
export const STOCK_APP_FONT_FAMILY = 'Geist'

type AppFontFamilySettings = Pick<
  GlobalSettings,
  'appFontFamily' | 'appFontFamilyDefaultedToAlbertSans'
>

export function normalizeAppFontFamilyDefault(
  settings: Partial<AppFontFamilySettings> | undefined,
  options: { preserveExplicitValue?: boolean } = {}
): AppFontFamilySettings {
  const defaulted =
    settings?.appFontFamilyDefaultedToAlbertSans === true || options.preserveExplicitValue === true
  const stored = settings?.appFontFamily ?? ''
  const trimmed = stored.trim()

  return {
    // Why: stock builds wrote their Geist default into profiles; only guarded
    // profiles or live user updates represent a real choice of Geist. Kept
    // values pass through unchanged so desktop and web persist the same string.
    appFontFamily:
      trimmed.length > 0 && (defaulted || trimmed !== STOCK_APP_FONT_FAMILY)
        ? stored
        : DEFAULT_APP_FONT_FAMILY,
    appFontFamilyDefaultedToAlbertSans: true
  }
}
