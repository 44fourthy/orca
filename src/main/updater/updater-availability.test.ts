import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  app: { isPackaged: true, getVersion: vi.fn(() => '1.4.197') },
  is: { dev: false }
}))

vi.mock('electron', () => ({ app: electron.app }))
vi.mock('@electron-toolkit/utils', () => ({ is: electron.is }))

import { isLocalBuildVersion, isUpdaterDisabled } from './updater-availability'

describe('updater availability', () => {
  beforeEach(() => {
    electron.app.isPackaged = true
    electron.is.dev = false
    electron.app.getVersion.mockReturnValue('1.4.197')
  })

  it('recognises the local-build prerelease stamp', () => {
    expect(isLocalBuildVersion('1.4.197-local.1789829051.1ee89d7d7a3d')).toBe(true)
    expect(isLocalBuildVersion('1.4.197')).toBe(false)
    expect(isLocalBuildVersion('1.4.160-hourly.202607281400')).toBe(false)
  })

  it('allows checks only for packaged, non-dev release builds', () => {
    expect(isUpdaterDisabled()).toBe(false)

    electron.app.isPackaged = false
    expect(isUpdaterDisabled()).toBe(true)

    electron.app.isPackaged = true
    electron.is.dev = true
    expect(isUpdaterDisabled()).toBe(true)
  })

  it('keeps a from-source build off the release feed', () => {
    electron.app.getVersion.mockReturnValue('1.4.197-local.1789829051.1ee89d7d7a3d')
    expect(isUpdaterDisabled()).toBe(true)
  })
})
