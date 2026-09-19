import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PersistedState } from '../shared/persisted-state-types'
import { testState, createStore, writeDataFile, readDataFile } from './persistence-test-harness'

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}))
vi.mock('./telemetry/client', () => ({ track: vi.fn() }))
vi.mock('./telemetry/cohort-classifier', () => ({ getCohortAtEmit: vi.fn() }))

const EMPTY_STATE = {
  schemaVersion: 1,
  repos: [],
  worktreeMeta: {},
  ui: {},
  githubCache: { pr: {}, issue: {} },
  workspaceSession: {}
} as const

// Why: the harness returns `unknown` because it re-hydrates projections; only settings are read here.
function readPersistedSettings(): PersistedState['settings'] {
  const parsed: PersistedState = JSON.parse(JSON.stringify(readDataFile()))
  return parsed.settings
}

describe('fork default migrations', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-test-'))
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('migrates a persisted stock Geist font to Albert Sans once', async () => {
    writeDataFile({ ...EMPTY_STATE, settings: { appFontFamily: 'Geist' } })

    const store = await createStore()

    expect(store.getSettings().appFontFamily).toBe('Albert Sans')
    expect(store.getSettings().appFontFamilyDefaultedToAlbertSans).toBe(true)
  })

  it('keeps Geist when the guarded profile chose it', async () => {
    writeDataFile({
      ...EMPTY_STATE,
      settings: { appFontFamily: 'Geist', appFontFamilyDefaultedToAlbertSans: true }
    })

    const store = await createStore()

    expect(store.getSettings().appFontFamily).toBe('Geist')
  })

  it('keeps Geist chosen live after the migration', async () => {
    writeDataFile({ ...EMPTY_STATE, settings: { appFontFamily: 'Geist' } })
    const store = await createStore()

    const updated = store.updateSettings({ appFontFamily: 'Geist' })

    expect(updated.appFontFamily).toBe('Geist')
    expect(updated.appFontFamilyDefaultedToAlbertSans).toBe(true)
  })

  it('migrates persisted chat-off defaults on once', async () => {
    writeDataFile({
      ...EMPTY_STATE,
      settings: { experimentalNativeChat: false, openAgentTabsInChatByDefault: false }
    })

    const store = await createStore()

    expect(store.getSettings().experimentalNativeChat).toBe(true)
    expect(store.getSettings().openAgentTabsInChatByDefault).toBe(true)
    expect(store.getSettings().nativeChatDefaultedOn).toBe(true)
  })

  it('preserves a chat opt-out after the default-on migration', async () => {
    writeDataFile({
      ...EMPTY_STATE,
      settings: { experimentalNativeChat: false, nativeChatDefaultedOn: true }
    })

    const store = await createStore()

    expect(store.getSettings().experimentalNativeChat).toBe(false)
    expect(store.getSettings().nativeChatDefaultedOn).toBe(true)
  })

  it('persists both migrations and their guards so a reload does not repeat them', async () => {
    writeDataFile({
      ...EMPTY_STATE,
      settings: { appFontFamily: 'Geist', experimentalNativeChat: false }
    })
    const store = await createStore()
    store.flush()

    const persisted = readPersistedSettings()
    expect(persisted.appFontFamily).toBe('Albert Sans')
    expect(persisted.appFontFamilyDefaultedToAlbertSans).toBe(true)
    expect(persisted.experimentalNativeChat).toBe(true)
    expect(persisted.nativeChatDefaultedOn).toBe(true)

    const reloaded = await createStore()
    expect(reloaded.getSettings().appFontFamily).toBe('Albert Sans')
    expect(reloaded.getSettings().experimentalNativeChat).toBe(true)
  })

  it('keeps live Geist and chat opt-out choices across a reload', async () => {
    const store = await createStore()
    store.updateSettings({ appFontFamily: 'Geist' })
    store.updateSettings({ experimentalNativeChat: false })
    store.flush()

    const reloaded = await createStore()
    expect(reloaded.getSettings().appFontFamily).toBe('Geist')
    expect(reloaded.getSettings().experimentalNativeChat).toBe(false)
    expect(reloaded.getSettings().openAgentTabsInChatByDefault).toBe(true)
  })

  it('does not let settings updates clear either migration guard', async () => {
    const store = await createStore()

    const updated = store.updateSettings({
      appFontFamilyDefaultedToAlbertSans: false,
      nativeChatDefaultedOn: false
    })

    expect(updated.appFontFamilyDefaultedToAlbertSans).toBe(true)
    expect(updated.nativeChatDefaultedOn).toBe(true)
  })
})
