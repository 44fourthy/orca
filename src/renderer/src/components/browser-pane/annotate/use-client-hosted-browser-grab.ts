import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { RuntimeBrowserClientPlacement } from '../../../../../shared/runtime-browser-placement'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'
import type { BrowserChromeElementTools } from '../assemble-chrome/browser-chrome-toolbar'
import type { BrowserChromeShortcutScope } from '../describe-page/browser-page-types'
import type { BrowserOverlayViewport } from '../describe-page/browser-annotation-geometry'
import { useGrabMode, type GrabModeHook } from './useGrabMode'
import { useBrowserPageAnnotationSend } from './use-browser-page-annotation-send'
import { useBrowserPageGrabAnnotations } from './use-browser-page-grab-annotations'
import { useBrowserPageGrabShortcuts } from './use-browser-page-grab-shortcuts'
import { useClientHostedBrowserMarkup } from './use-client-hosted-browser-markup'
import { syncGuestAnnotationViewportBridge } from './guest-annotation-viewport-bridge'

type AnnotationSend = ReturnType<typeof useBrowserPageAnnotationSend>
type GrabAnnotations = ReturnType<typeof useBrowserPageGrabAnnotations>
type ClientHostedMarkup = ReturnType<typeof useClientHostedBrowserMarkup>

/** The element picker's wiring for a client-hosted page: state, main IPC, and the shared overlays' inputs. */
export type ClientHostedBrowserGrab = {
  grab: GrabModeHook
  grabAnnotations: GrabAnnotations
  annotationSend: AnnotationSend
  markup: ClientHostedMarkup
  elementTools: BrowserChromeElementTools
  /** Callback ref for the pane's viewport: the overlays anchor through the element it captures. */
  bindViewport: (element: HTMLDivElement | null) => void
  overlayProps: {
    grab: GrabModeHook
    annotationSend: AnnotationSend
    grabAnnotations: GrabAnnotations
    containerRef: RefObject<HTMLDivElement | null>
    webviewRef: MutableRefObject<Electron.WebviewTag | null>
    browserOverlayViewport: BrowserOverlayViewport
    worktreeId: string
  }
}

/**
 * Why one hook for the whole surface: the picker, its annotations, the draw tool and the in-guest
 * annotation bridge share state (only one in-guest tool may be armed, annotations feed both the
 * tray and the bridge), and the pane must not carry that cross-talk itself.
 */
export function useClientHostedBrowserGrab({
  browserTab,
  workspaceId,
  worktreeId,
  chromeShortcutScope,
  isActive,
  runtimeEnvironmentId,
  placement,
  unavailable,
  showFailureOverlay,
  pageHostGeneration,
  viewportRef,
  webviewRef
}: {
  browserTab: { id: string; url: string }
  workspaceId: string
  worktreeId: string
  chromeShortcutScope: BrowserChromeShortcutScope
  isActive: boolean
  runtimeEnvironmentId: string
  placement: RuntimeBrowserClientPlacement | null
  unavailable: boolean
  showFailureOverlay: boolean
  pageHostGeneration: number | null
  viewportRef: MutableRefObject<HTMLDivElement | null>
  webviewRef: MutableRefObject<Electron.WebviewTag | null>
}): ClientHostedBrowserGrab {
  const [viewportContainer, setViewportContainer] = useState<HTMLDivElement | null>(null)
  const [browserOverlayViewport, setBrowserOverlayViewport] = useState<BrowserOverlayViewport>({
    scrollX: 0,
    scrollY: 0,
    version: 0
  })
  // Why a callback ref and not a ref write: the overlays anchor through this container, and a ref
  // write alone would leave the first render's anchors without one.
  const bindViewport = useCallback(
    (element: HTMLDivElement | null) => {
      viewportRef.current = element
      setViewportContainer(element)
    },
    [viewportRef]
  )

  const annotationSend = useBrowserPageAnnotationSend({
    browserTabId: browserTab.id,
    worktreeId
  })
  const grab = useGrabMode(browserTab.id)
  const grabIsInteractive = grab.state !== 'idle' && grab.state !== 'error'
  const grabAnnotations = useBrowserPageGrabAnnotations({
    browserTabId: browserTab.id,
    isActive,
    grab,
    containerRef: viewportRef,
    trackingContainer: viewportContainer,
    webviewRef,
    setBrowserOverlayViewport,
    browserAnnotationsLength: annotationSend.browserAnnotations.length,
    setBrowserAnnotationTrayOpen: annotationSend.setBrowserAnnotationTrayOpen
  })
  const grabShortcutLabel = useShortcutLabel('browser.grabElement')
  // Why the picker locks the draw tool: both drive the same in-guest surface, so only one may be armed.
  const markup = useClientHostedBrowserMarkup({
    webviewRef,
    browserPageId: browserTab.id,
    runtimeEnvironmentId,
    placement,
    isActive,
    unavailable,
    showFailureOverlay,
    toolLocked: grabIsInteractive
  })
  useBrowserPageGrabShortcuts({
    browserTabId: browserTab.id,
    workspaceId,
    chromeShortcutScope,
    markupIsActive: markup.isActive,
    startGrabIntent: grabAnnotations.startGrabIntent,
    handleGrabActionShortcut: grabAnnotations.handleGrabActionShortcut,
    grabIsInteractive
  })

  // Badges for stored annotations render in-guest so they track scroll without a message per frame.
  const annotationBridgeTokenRef = useRef<string>('')
  annotationBridgeTokenRef.current ||= createBrowserUuid().replaceAll('-', '')
  const annotationsForBridge = annotationSend.browserAnnotations
  const pendingAnnotationForBridge: BrowserGrabPayload | null =
    grabAnnotations.pendingAnnotationPayload
  const annotationsLengthForBridge = annotationsForBridge.length
  useEffect(() => {
    syncGuestAnnotationViewportBridge({
      toolTargetId: browserTab.id,
      annotations: annotationsForBridge,
      pendingPayload: pendingAnnotationForBridge,
      surfaceActive: isActive,
      token: annotationBridgeTokenRef.current
    })
  }, [
    annotationsForBridge,
    annotationsLengthForBridge,
    browserTab.id,
    isActive,
    pageHostGeneration,
    pendingAnnotationForBridge
  ])

  const isBlankTab = browserTab.url === 'about:blank' || browserTab.url === ORCA_BROWSER_BLANK_URL
  const elementTools: BrowserChromeElementTools = {
    activeIntent: grabIsInteractive ? grabAnnotations.grabIntent : null,
    onStartIntent: grabAnnotations.startGrabIntent,
    disabled:
      !isActive ||
      placement === null ||
      unavailable ||
      showFailureOverlay ||
      isBlankTab ||
      markup.isActive,
    grabShortcutLabel,
    annotationCount: annotationsLengthForBridge
  }

  return {
    grab,
    grabAnnotations,
    annotationSend,
    markup,
    elementTools,
    bindViewport,
    overlayProps: {
      grab,
      annotationSend,
      grabAnnotations,
      containerRef: viewportRef,
      webviewRef,
      browserOverlayViewport,
      worktreeId
    }
  }
}
