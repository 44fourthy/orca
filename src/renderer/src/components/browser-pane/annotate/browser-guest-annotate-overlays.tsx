import { createPortal } from 'react-dom'
import type { MutableRefObject, RefObject } from 'react'
import { MarkupOverlay } from './MarkupOverlay'
import type { MarkupModeController } from './useMarkupMode'
import type { GrabModeHook } from './useGrabMode'
import type { BrowserOverlayViewport } from '../describe-page/browser-annotation-geometry'
import { BrowserGuestGrabOverlays } from './browser-guest-grab-overlays'
import type { useBrowserPageAnnotationSend } from './use-browser-page-annotation-send'
import type { useBrowserPageGrabAnnotations } from './use-browser-page-grab-annotations'

/**
 * Everything the annotate and markup tools paint over a guest: the draw surface, the pending
 * comment card, the annotation tray, the right-click grab menu and the inline confirmation toast.
 *
 * Shared because these overlays are the other half of the toolbar's tool cluster — a surface that
 * offers the tools but not these would arm a picker whose result the reader could never see.
 */
export function BrowserGuestAnnotateOverlays({
  markup,
  grab,
  annotationSend,
  grabAnnotations,
  containerRef,
  markupPortalContainer,
  webviewRef,
  browserOverlayViewport,
  worktreeId
}: {
  markup: MarkupModeController
  grab: GrabModeHook
  annotationSend: ReturnType<typeof useBrowserPageAnnotationSend>
  grabAnnotations: ReturnType<typeof useBrowserPageGrabAnnotations>
  containerRef: RefObject<HTMLDivElement | null>
  markupPortalContainer?: HTMLDivElement | null
  webviewRef: MutableRefObject<Electron.WebviewTag | null>
  browserOverlayViewport: BrowserOverlayViewport
  worktreeId: string
}): React.JSX.Element {
  const markupTarget = markupPortalContainer ?? containerRef.current

  return (
    <>
      {markup.isActive && markup.baseImage && markupTarget
        ? createPortal(
            <MarkupOverlay
              baseImage={markup.baseImage}
              busy={markup.state === 'composing'}
              onComplete={(input) => void markup.complete(input)}
              onCancel={markup.cancel}
            />,
            markupTarget
          )
        : null}
      <BrowserGuestGrabOverlays
        grab={grab}
        annotationSend={annotationSend}
        grabAnnotations={grabAnnotations}
        containerRef={containerRef}
        webviewRef={webviewRef}
        browserOverlayViewport={browserOverlayViewport}
        worktreeId={worktreeId}
      />
    </>
  )
}
