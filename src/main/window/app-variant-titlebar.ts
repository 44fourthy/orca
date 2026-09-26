import type { BrowserWindow } from 'electron'
import { packagedAppVariant } from '../../shared/packaged-app-variant'

/**
 * Titlebar accents for the branded per-client copies — the color each client's
 * app carries in its icon, so the window chrome says at a glance which app this
 * is. The default bundle has no variant and keeps the theme's chrome.
 */
const VARIANT_TITLEBAR_ACCENTS: Record<string, string> = {
  bara: '#3b82f6',
  lif: '#ec4899',
  colors: '#8b5cf6',
  topline: '#f97316'
}

/**
 * CSS tinting this bundle's windows, or null for the default bundle. The
 * titlebar rules carry `!important` because the chrome's own rules are
 * utility-driven; the accent strip covers windows whose title bar the OS draws
 * (the dashboard pop-out uses a native frame), where no CSS can reach the
 * chrome itself.
 */
export function appVariantTitlebarCss(execPath: string = process.execPath): string | null {
  const variant = packagedAppVariant(execPath)
  const accent = variant ? VARIANT_TITLEBAR_ACCENTS[variant] : undefined
  if (!accent) {
    return null
  }
  return [
    `.titlebar, .titlebar-left { background-color: ${accent} !important; }`,
    `html::after { content: ''; position: fixed; top: 0; left: 0; right: 0; height: 3px;`,
    `  background: ${accent}; pointer-events: none; z-index: 2147483647; }`
  ].join('\n')
}

/**
 * Applies the branded chrome to a window's renderer, on every load so reloads
 * keep it. A no-op for the default bundle and for windows that never load the
 * Orca renderer.
 */
export function applyAppVariantWindowChrome(
  target: BrowserWindow,
  execPath: string = process.execPath
): void {
  const css = appVariantTitlebarCss(execPath)
  if (!css) {
    return
  }
  target.webContents.on('did-finish-load', () => {
    if (!target.isDestroyed()) {
      void target.webContents.insertCSS(css)
    }
  })
}
