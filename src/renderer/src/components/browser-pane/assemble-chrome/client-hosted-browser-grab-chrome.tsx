import { BrowserElementToolButtons } from './browser-chrome-toolbar'
import { BrowserGuestGrabOverlays } from '../annotate/browser-guest-grab-overlays'
import type { ClientHostedBrowserGrab } from '../annotate/use-client-hosted-browser-grab'

/**
 * The element tools in a client-hosted pane's nav row: the grab/annotate pair plus the draw button
 * they share the surface with. Split out so the pane keeps only a one-line slot for the tool
 * cluster, the way its host row keeps one for the address bar.
 */
export function ClientHostedBrowserGrabTools({
  grab
}: {
  grab: ClientHostedBrowserGrab
}): React.JSX.Element {
  return (
    <>
      <BrowserElementToolButtons elementTools={grab.elementTools} />
      {grab.markup.drawButton}
    </>
  )
}

/**
 * The overlays a client-hosted pane paints over its guest: the draw surface plus the picker's
 * pending card, tray, context menu and toast. The draw overlay stays pane-owned because this
 * surface hides the retained native layer itself, rather than portaling over it.
 */
export function ClientHostedBrowserGrabOverlays({
  grab
}: {
  grab: ClientHostedBrowserGrab
}): React.JSX.Element {
  return (
    <>
      {grab.markup.overlay}
      <BrowserGuestGrabOverlays {...grab.overlayProps} />
    </>
  )
}
