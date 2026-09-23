// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { BrowserGrabPayload, BrowserGrabResult } from '../../../../shared/browser-grab-types'
import { installClientHostedPaneApi, paneChannel } from './client-hosted-browser-pane-test-rig'
import { ClientHostedBrowserPagePane } from './ClientHostedBrowserPagePane'

const mocks = vi.hoisted(() => ({ attach: vi.fn(), error: vi.fn() }))
vi.mock('./browser-client-page-renderer-installation', () => ({
  attachBrowserClientPageToViewport: mocks.attach
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: vi.fn() } }))

type PaneProps = ComponentProps<typeof ClientHostedBrowserPagePane>
const placement = {
  kind: 'client' as const,
  browserHostClientId: 'host-a',
  browserHostGeneration: 3,
  pageHostGeneration: 7
}
const payload: BrowserGrabPayload = {
  page: {
    sanitizedUrl: 'https://example.internal/app',
    title: 'App',
    viewportWidth: 800,
    viewportHeight: 600,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    capturedAt: '2026-09-23T00:00:00.000Z'
  },
  target: {
    tagName: 'button',
    selector: 'button.primary',
    textSnippet: 'Save',
    htmlSnippet: '<button class="primary">Save</button>',
    attributes: { class: 'primary' },
    accessibility: {
      role: 'button',
      accessibleName: 'Save',
      ariaLabel: null,
      ariaLabelledBy: null
    },
    rectViewport: { x: 10, y: 20, width: 80, height: 30 },
    rectPage: { x: 10, y: 20, width: 80, height: 30 },
    computedStyles: {
      display: 'inline-flex',
      position: 'static',
      width: '80px',
      height: '30px',
      margin: '0px',
      padding: '4px 12px',
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(20, 20, 20)',
      border: 'none',
      borderRadius: '6px',
      fontFamily: 'Inter',
      fontSize: '13px',
      fontWeight: '500',
      lineHeight: '18px',
      textAlign: 'center',
      zIndex: 'auto'
    }
  },
  nearbyText: [],
  ancestorPath: ['body', 'main'],
  screenshot: null
}

const grabModeToggle = paneChannel<string>()
const grabActionShortcut = paneChannel<{ browserPageId: string; key: 'c' | 's' }>()

function makeBrowserApi() {
  return {
    setGrabMode: vi.fn(async () => ({ ok: true as const })),
    awaitGrabSelection: vi.fn(() => new Promise<BrowserGrabResult>(() => {})),
    cancelGrab: vi.fn(async () => true),
    captureSelectionScreenshot: vi.fn(async () => ({
      ok: false as const,
      reason: 'No screenshot'
    })),
    extractHoverPayload: vi.fn(async () => ({ ok: false as const, reason: 'No element hovered' })),
    onGrabModeToggle: grabModeToggle.subscribe,
    onGrabActionShortcut: grabActionShortcut.subscribe
  }
}
let browserApi = makeBrowserApi()

beforeEach(() => {
  browserApi = makeBrowserApi()
  installClientHostedPaneApi({ browser: browserApi })
  useAppStore.setState({ browserCertificateFailuresByPageId: {}, browserAnnotationsByPageId: {} })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function renderPane(overrides: Partial<PaneProps> = {}) {
  const webview = document.createElement('webview')
  Object.assign(webview, {
    getURL: () => 'https://example.internal/app',
    getTitle: () => 'App',
    isLoading: () => false,
    canGoBack: () => false,
    canGoForward: () => false,
    getWebContentsId: () => 42,
    getZoomLevel: () => 0,
    focus: vi.fn(),
    blur: vi.fn(),
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 })
  })
  mocks.attach.mockReturnValue({
    webview,
    detach: vi.fn(),
    nextMetadataRevision: () => 1
  })
  let props: PaneProps = {
    browserTab: {
      id: 'page-a',
      workspaceId: 'workspace-a',
      worktreeId: 'folder-a',
      url: 'https://example.internal/app',
      title: 'App',
      loading: false,
      faviconUrl: null,
      canGoBack: false,
      canGoForward: false,
      loadError: null,
      createdAt: 1
    },
    workspaceId: 'workspace-a',
    runtimeEnvironmentId: 'environment-a',
    worktreeId: 'folder-a',
    placement,
    isActive: true,
    chromeShortcutScope: 'focused',
    onUpdatePageState: vi.fn(),
    onSetUrl: vi.fn(),
    ...overrides
  }
  const element = () => (
    <TooltipProvider>
      <ClientHostedBrowserPagePane {...props} />
    </TooltipProvider>
  )
  const view = render(element())
  return {
    webview,
    update: (updates: Partial<PaneProps>) => {
      props = { ...props, ...updates }
      view.rerender(element())
    }
  }
}

function grabButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Grab page element' })
}
function annotateButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Annotate page element' })
}
function drawButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Draw on screenshot' })
}

describe('client-hosted element grab', () => {
  it('arms the in-guest picker through main for the client-hosted page', async () => {
    renderPane()
    fireEvent.click(grabButton())
    await waitFor(() =>
      expect(browserApi.setGrabMode).toHaveBeenCalledWith({
        browserPageId: 'page-a',
        enabled: true
      })
    )
    expect(browserApi.awaitGrabSelection).toHaveBeenCalledWith({
      browserPageId: 'page-a',
      opId: expect.stringMatching(/^grab-/)
    })
  })

  it('copies the grabbed element to the clipboard when the pick lands', async () => {
    let resolveSelection!: (result: BrowserGrabResult) => void
    browserApi.awaitGrabSelection.mockImplementation(
      () =>
        new Promise<BrowserGrabResult>((resolve) => {
          resolveSelection = resolve
        })
    )
    renderPane()
    fireEvent.click(grabButton())
    await waitFor(() => expect(browserApi.awaitGrabSelection).toHaveBeenCalled())
    await act(async () => {
      resolveSelection({ opId: 'op-1', kind: 'selected', payload })
    })
    await waitFor(() =>
      expect(window.api.ui.writeClipboardText).toHaveBeenCalledWith(
        expect.stringContaining('Selector: button.primary')
      )
    )
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('holds a picked element as a pending annotation and adds it to the tray', async () => {
    let resolveSelection!: (result: BrowserGrabResult) => void
    browserApi.awaitGrabSelection.mockImplementation(
      () =>
        new Promise<BrowserGrabResult>((resolve) => {
          resolveSelection = resolve
        })
    )
    renderPane()
    fireEvent.click(annotateButton())
    await waitFor(() => expect(browserApi.awaitGrabSelection).toHaveBeenCalled())
    await act(async () => {
      resolveSelection({ opId: 'op-2', kind: 'selected', payload })
    })
    const comment = await screen.findByPlaceholderText(/Describe what the agent should change/)
    fireEvent.change(comment, { target: { value: 'Make this primary button larger' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add/ }))
    await waitFor(() =>
      expect(useAppStore.getState().browserAnnotationsByPageId['page-a']).toHaveLength(1)
    )
    expect(annotateButton().textContent).toContain('1')
  })

  it('keeps the draw tool locked while the picker owns the page', async () => {
    renderPane()
    expect(drawButton().disabled).toBe(false)
    fireEvent.click(grabButton())
    await waitFor(() => expect(browserApi.setGrabMode).toHaveBeenCalled())
    expect(drawButton().disabled).toBe(true)
  })

  it.each(['placement-pending', 'inactive'])('disables the picker for a %s pane', (state) => {
    renderPane(state === 'placement-pending' ? { placement: null } : { isActive: false })
    expect(grabButton().disabled).toBe(true)
    fireEvent.click(grabButton())
    expect(browserApi.setGrabMode).not.toHaveBeenCalled()
  })

  it('syncs the annotation viewport bridge against the client-hosted page', async () => {
    renderPane()
    await waitFor(() =>
      expect(window.api.browser.setAnnotationViewportBridge).toHaveBeenCalledWith(
        expect.objectContaining({ browserPageId: 'page-a' })
      )
    )
  })
})
