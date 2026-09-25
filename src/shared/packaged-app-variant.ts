import { basename, dirname, join } from 'node:path'

/**
 * Branded per-client copies ship as "Orca <Variant>.app" (built with
 * `ORCA_BUILD_VARIANT`; see config/electron-builder.config.cjs). The variant is
 * read from the running bundle's path — the app and the CLI bundled inside it
 * both execute from that path — so a copy needs no launch configuration, and
 * the variant keys the copy's own userData directory. Without it the copies
 * would share one SQLite store, daemon socket and single-instance lock.
 */
export function packagedAppVariant(execPath: string, platform = process.platform): string | null {
  if (platform !== 'darwin') {
    return null
  }
  // …/Orca LIF.app/Contents/MacOS/Orca LIF → …/Orca LIF.app
  const bundle = basename(dirname(dirname(dirname(execPath))))
  const match = /^Orca ([A-Za-z0-9][A-Za-z0-9 ._-]*)\.app$/.exec(bundle)
  return match ? match[1].toLowerCase().replace(/[^a-z0-9]+/g, '-') : null
}

/** The variant's own userData directory under `appDataDir`, or null for the
 *  default bundle (which keeps the plain `orca` profile). */
export function packagedVariantUserDataDir(appDataDir: string, execPath: string): string | null {
  const variant = packagedAppVariant(execPath)
  return variant ? join(appDataDir, `orca-${variant}`) : null
}
