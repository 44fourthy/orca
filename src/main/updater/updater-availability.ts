import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

/** `build-mac-local.mjs` stamps from-source builds with a `-local.` prerelease. */
export function isLocalBuildVersion(version: string): boolean {
  return version.includes('-local.')
}

/** Why local builds too: they carry customizations, and any accepted release-feed
 *  update would replace them with a stock Orca. */
export function isUpdaterDisabled(): boolean {
  return !app.isPackaged || is.dev || isLocalBuildVersion(app.getVersion())
}
