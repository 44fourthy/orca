import type { MutableRefObject } from 'react'
import type { BrowserChromeShortcutScope, GrabIntent } from '../describe-page/browser-page-types'
import { useBrowserPageGrabShortcuts } from '../annotate/use-browser-page-grab-shortcuts'
import { useBrowserPageWebviewShortcuts } from './use-browser-page-webview-shortcuts'

export function useBrowserPageKeyboardShortcuts({
  browserTabId,
  workspaceId,
  isActive,
  chromeShortcutScope,
  isActiveRef,
  markupIsActive,
  webviewRef,
  paneZoomLevelRef,
  setBrowserDefaultZoomLevel,
  showBrowserZoomFeedback,
  reloadWebviewOrRecoverGuest,
  startGrabIntent,
  handleGrabActionShortcut,
  grabIsInteractive
}: {
  browserTabId: string
  workspaceId: string
  isActive: boolean
  chromeShortcutScope: BrowserChromeShortcutScope
  isActiveRef: MutableRefObject<boolean>
  markupIsActive: boolean
  webviewRef: MutableRefObject<Electron.WebviewTag | null>
  paneZoomLevelRef: MutableRefObject<number>
  setBrowserDefaultZoomLevel: (level: number) => void
  showBrowserZoomFeedback: (level: number) => void
  reloadWebviewOrRecoverGuest: (ignoreCache: boolean) => void
  startGrabIntent: (intent: GrabIntent) => void
  handleGrabActionShortcut: (key: 'c' | 's') => void
  grabIsInteractive: boolean
}): void {
  useBrowserPageWebviewShortcuts({
    browserTabId,
    workspaceId,
    isActive,
    chromeShortcutScope,
    isActiveRef,
    webviewRef,
    paneZoomLevelRef,
    setBrowserDefaultZoomLevel,
    showBrowserZoomFeedback,
    reloadWebviewOrRecoverGuest
  })

  useBrowserPageGrabShortcuts({
    browserTabId,
    workspaceId,
    chromeShortcutScope,
    markupIsActive,
    startGrabIntent,
    handleGrabActionShortcut,
    grabIsInteractive
  })
}
