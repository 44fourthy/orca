import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPENCODE_TEST_SCHEMA,
  seedOpenCodeSession
} from '../shared/opencode-session-window-fixture'
import { OPENCODE_SESSION_WINDOW_METHOD } from '../shared/opencode-session-window'
import { OpenCodeSessionHandler } from './opencode-session-handler'
import type { RelayDispatcher } from './dispatcher'

let dir = ''
const originalDb = process.env.OPENCODE_DB

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orca-relay-opencode-'))
  const dbPath = join(dir, 'opencode.db')
  const db = new DatabaseSync(dbPath)
  db.exec(OPENCODE_TEST_SCHEMA)
  seedOpenCodeSession(db, 'ses_host', 1)
  db.close()
  process.env.OPENCODE_DB = dbPath
})

afterEach(async () => {
  if (originalDb === undefined) {
    delete process.env.OPENCODE_DB
  } else {
    process.env.OPENCODE_DB = originalDb
  }
  await rm(dir, { recursive: true, force: true })
})

describe('OpenCodeSessionHandler', () => {
  it('registers the method and serves a session window from the host database', async () => {
    const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only ever calls `onRequest`; the rest of the dispatcher is irrelevant to this test.
    const dispatcher = {
      onRequest: vi.fn(
        (method: string, handler: (params: Record<string, unknown>) => Promise<unknown>) => {
          handlers.set(method, handler)
        }
      )
    } as unknown as RelayDispatcher
    new OpenCodeSessionHandler(dispatcher)
    const handler = handlers.get(OPENCODE_SESSION_WINDOW_METHOD)
    expect(handler).toBeDefined()

    const window = await handler!({ sessionId: 'ses_host', limit: 10 })
    expect(window).toMatchObject({ sessionId: 'ses_host', totalMessages: 2 })
    const token = await handler!({ sessionId: 'ses_host', limit: 10, tokenOnly: true })
    expect(token).toMatchObject({ sessionId: 'ses_host', messages: [], parts: [] })
    await expect(handler!({ sessionId: 'ses_other', limit: 10 })).resolves.toBeNull()
    await expect(handler!({ limit: 10 })).rejects.toThrow(/sessionId/)
  })
})
