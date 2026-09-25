import { describe, expect, it } from 'vitest'
import { packagedAppVariant, packagedVariantUserDataDir } from './packaged-app-variant'

const exe = (bundle: string): string => `/Applications/${bundle}/Contents/MacOS/Orca`

describe('packagedAppVariant', () => {
  it('reads the variant from a branded bundle path', () => {
    expect(packagedAppVariant(exe('Orca LIF.app'), 'darwin')).toBe('lif')
    expect(packagedAppVariant(exe('Orca Colors.app'), 'darwin')).toBe('colors')
    expect(packagedAppVariant(exe('Orca Bara.app'), 'darwin')).toBe('bara')
  })

  it('returns null for the default bundle and other platforms', () => {
    expect(packagedAppVariant(exe('Orca.app'), 'darwin')).toBeNull()
    expect(packagedAppVariant(exe('Orca LIF.app'), 'linux')).toBeNull()
    expect(packagedAppVariant('/opt/orca/orca', 'linux')).toBeNull()
  })

  it('keys the userData directory by variant only when branded', () => {
    expect(packagedVariantUserDataDir('/u/appData', exe('Orca LIF.app'))).toBe('/u/appData/orca-lif')
    expect(packagedVariantUserDataDir('/u/appData', exe('Orca.app'))).toBeNull()
  })
})
