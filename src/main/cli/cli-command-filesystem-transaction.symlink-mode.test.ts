import { describe, expect, it } from 'vitest'
import { buildMacPrivilegedSymlinkTransaction } from './cli-command-filesystem-transaction'

describe('buildMacPrivilegedSymlinkTransaction', () => {
  it('creates the published symlink under a readable umask', () => {
    const script = buildMacPrivilegedSymlinkTransaction({
      action: 'install',
      commandPath: '/usr/local/bin/orca',
      launcherPath: '/Applications/Orca.app/Contents/Resources/bin/orca',
      expected: null,
      expectedFileSha256: null,
      expectedRawSymlinkTarget: null
    })
    // Why: macOS honours a symlink's own mode, so the 077 the transaction dirs use
    // must not reach `ln -s` or non-root processes fail readlink with EACCES.
    expect(script).toMatch(/umask 022 && \/bin\/ln -s /)
    expect(script.indexOf('umask 077')).toBeLessThan(script.indexOf('umask 022'))
  })
})
