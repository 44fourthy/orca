import { packagedAppVariant } from '../../shared/packaged-app-variant'

/**
 * Titlebar accents for the branded per-client copies — the color each client's
 * app carries in its icon, so the window chrome (the row with the traffic
 * lights) says at a glance which app this is. The default bundle has no variant
 * and keeps the theme's chrome.
 */
const VARIANT_TITLEBAR_ACCENTS: Record<string, string> = {
  bara: '#3b82f6',
  lif: '#ec4899',
  colors: '#8b5cf6',
  topline: '#f97316'
}

/**
 * CSS tinting this bundle's titlebar, or null for the default bundle. Injected
 * with `!important` because the titlebar's own rules are utility-driven.
 */
export function appVariantTitlebarCss(execPath: string = process.execPath): string | null {
  const variant = packagedAppVariant(execPath)
  const accent = variant ? VARIANT_TITLEBAR_ACCENTS[variant] : undefined
  if (!accent) {
    return null
  }
  return `.titlebar, .titlebar-left { background-color: ${accent} !important; }`
}
