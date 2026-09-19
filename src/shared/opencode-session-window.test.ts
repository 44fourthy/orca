import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  openCodeSessionChangeToken,
  openCodeSessionExists,
  parseOpenCodeSessionWindow,
  readOpenCodeSessionWindow
} from './opencode-session-window'
import { OPENCODE_TEST_SCHEMA, seedOpenCodeSession } from './opencode-session-window-fixture'

let dir = ''
let db: DatabaseSync

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orca-opencode-window-'))
  db = new DatabaseSync(join(dir, 'opencode.db'))
  db.exec(OPENCODE_TEST_SCHEMA)
  seedOpenCodeSession(db, 'ses_1', 3)
})

afterEach(async () => {
  db.close()
  await rm(dir, { recursive: true, force: true })
})

describe('opencode session window', () => {
  it('answers whether a session exists and a change token that moves with writes', () => {
    expect(openCodeSessionExists(db, 'ses_1')).toBe(true)
    expect(openCodeSessionExists(db, 'ses_missing')).toBe(false)
    const before = openCodeSessionChangeToken(db, 'ses_1')
    db.prepare("UPDATE part SET time_updated = time_updated + 1 WHERE id = 'prt_f2'").run()
    expect(openCodeSessionChangeToken(db, 'ses_1')).not.toBe(before)
  })

  it('returns the newest messages oldest-first with all of their parts', () => {
    const window = readOpenCodeSessionWindow(db, { sessionId: 'ses_1', limit: 2 })
    expect(window?.totalMessages).toBe(6)
    expect(window?.messages.map((m) => m.id)).toEqual(['msg_u2', 'msg_a2'])
    expect(window?.parts.map((p) => p.id)).toEqual([
      'prt_u2',
      'prt_s2',
      'prt_r2',
      'prt_t2',
      'prt_x2',
      'prt_f2'
    ])
    expect(readOpenCodeSessionWindow(db, { sessionId: 'nope', limit: 2 })).toBeNull()
  })

  it('round-trips a window through the wire validator and rejects junk', () => {
    const window = readOpenCodeSessionWindow(db, { sessionId: 'ses_1', limit: 6 })
    expect(parseOpenCodeSessionWindow(JSON.parse(JSON.stringify(window)))).toEqual(window)
    expect(
      parseOpenCodeSessionWindow({ sessionId: 'x', messages: [{ id: 1 }], parts: [] })
    ).toBeNull()
    expect(parseOpenCodeSessionWindow('nope')).toBeNull()
  })
})
