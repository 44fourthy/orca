import { toHttpsRecoveryUrl } from '../../../../../shared/browser-url'
import type {
  BrowserCertificateFailure,
  BrowserLoadError
} from '../../../../../shared/browser-workspace-types'
import { BrowserLoadFailureOverlay } from '../navigate/browser-load-failure-overlay'
import { ClientHostedBrowserUnavailableNotice } from '../client-hosted-browser-unavailable-notice'
import { getOpenableExternalUrl, toDisplayUrl } from '../describe-page/browser-page-url-display'

/**
 * What a client-hosted pane shows in place of a page it cannot paint: the load-failure overlay for
 * a failed navigation, or the recovery notice once the retained guest is gone. Both hand the reader
 * the escape hatch for a page whose host is this desktop.
 */
export function ClientHostedBrowserPaneNotices({
  showFailureOverlay,
  loadError,
  failedNavigationUrl,
  certificateFailure,
  browserPageId,
  onRetry,
  onTryHttps,
  unavailable,
  runtimeEnvironmentId,
  worktreeId,
  lastCommittedUrl
}: {
  showFailureOverlay: boolean
  loadError: BrowserLoadError | null
  failedNavigationUrl: string
  certificateFailure: BrowserCertificateFailure | null
  browserPageId: string
  onRetry: () => void
  onTryHttps: (url: string) => void
  unavailable: boolean
  runtimeEnvironmentId: string
  worktreeId: string
  lastCommittedUrl: string
}): React.JSX.Element {
  return (
    <>
      {showFailureOverlay && loadError ? (
        <BrowserLoadFailureOverlay
          loadError={loadError}
          currentUrl={toDisplayUrl(failedNavigationUrl)}
          httpsRecoveryUrl={toHttpsRecoveryUrl(failedNavigationUrl)}
          onRetry={onRetry}
          onTryHttps={onTryHttps}
          onCopy={(url) => void window.api.ui.writeClipboardText(url)}
          onOpenExternal={(url) => void window.api.shell.openUrl(url)}
          externalUrl={getOpenableExternalUrl(failedNavigationUrl)}
          certificateFailure={certificateFailure}
          expectedBrowserPageId={browserPageId}
          // Why: the guest is a local Electron webview on this desktop, so its certificate
          // decision is a local session decision — the same IPC the local pane proceeds through.
          onProceedCertificate={(challengeId) =>
            window.api.browser.proceedCertificate({ browserPageId, challengeId })
          }
        />
      ) : null}
      {unavailable ? (
        <ClientHostedBrowserUnavailableNotice
          runtimeEnvironmentId={runtimeEnvironmentId}
          worktreeId={worktreeId}
          lastCommittedUrl={lastCommittedUrl}
        />
      ) : null}
    </>
  )
}
