import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../shared/native-chat-types'
import {
  OPENCODE_TEST_SCHEMA,
  seedOpenCodeSession
} from '../../../shared/opencode-session-window-fixture'
import { readNativeChatTranscriptTail } from '../transcript-tail-reader'
import { subscribeOpenCodeNativeChatSession } from './opencode-native-chat-session'
import { setOpenCodeRemoteSessionWindowReader } from './opencode-remote-session-window'

let dir = ''
let db: DatabaseSync
const originalDb = process.env.OPENCODE_DB

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orca-opencode-chat-'))
  const dbPath = join(dir, 'opencode.db')
  db = new DatabaseSync(dbPath)
  db.exec(OPENCODE_TEST_SCHEMA)
  seedOpenCodeSession(db, 'ses_1', 2)
  // Why: the local reader discovers databases through OPENCODE_DB like OpenCode itself.
  process.env.OPENCODE_DB = dbPath
})

afterEach(async () => {
  db.close()
  if (originalDb === undefined) {
    delete process.env.OPENCODE_DB
  } else {
    process.env.OPENCODE_DB = originalDb
  }
  await rm(dir, { recursive: true, force: true })
})

function appendTurn(turn: number): void {
  const base = 50_000 + turn
  db.prepare(
    'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)'
  ).run(
    `msg_live${turn}`,
    'ses_1',
    base,
    base,
    JSON.stringify({ role: 'user', time: { created: base } })
  )
  db.prepare(
    'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    `prt_live${turn}`,
    `msg_live${turn}`,
    'ses_1',
    base,
    base,
    JSON.stringify({ type: 'text', text: `live ${turn}` })
  )
}

describe('opencode native chat (local database)', () => {
  it('reads the newest window through the shared tail-reader entry point', async () => {
    const result = await readNativeChatTranscriptTail({
      agent: 'opencode',
      sessionId: 'ses_1',
      limit: 2
    })
    expect(result).toMatchObject({ hasMore: true, beforeOffset: 2 })
    if ('error' in result) {
      throw new Error(result.error)
    }
    expect(result.messages.map((m) => m.id)).toEqual([
      'msg_u1',
      'prt_r1',
      'prt_t1',
      'prt_t1:result',
      'prt_x1'
    ])
    expect(result.lifecycle).toMatchObject({ state: 'completed', turnId: 'msg_a1' })
  })

  it('reports an unknown session as not found, never as a read error', async () => {
    await expect(
      readNativeChatTranscriptTail({ agent: 'opencode', sessionId: 'ses_nope', limit: 5 })
    ).resolves.toMatchObject({ notFound: true })
  })

  it('publishes a snapshot, then replacements as the database changes', async () => {
    const snapshots: NativeChatMessage[][] = []
    const replacements: NativeChatMessage[][] = []
    const subscription = await subscribeOpenCodeNativeChatSession({
      agent: 'opencode',
      sessionId: 'ses_1',
      initialLimit: 50,
      onAppend: () => {},
      onInitialSnapshot: (messages) => snapshots.push(messages),
      onReplace: (messages) => replacements.push(messages),
      pollIntervalMs: 20
    })
    expect(subscription.watching).toBe(true)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.at(-1)?.id).toBe('prt_x1')

    appendTurn(1)
    await vi.waitFor(() => expect(replacements.length).toBeGreaterThan(0), { timeout: 2_000 })
    expect(replacements.at(-1)?.at(-1)).toMatchObject({ id: 'msg_live1', role: 'user' })

    const seen = replacements.length
    await new Promise((resolve) => setTimeout(resolve, 80))
    // Nothing changed: no redundant republish.
    expect(replacements.length).toBe(seen)
    subscription.unsubscribe()
  })

  it('routes an ssh execution host to the remote reader, never this database', async () => {
    const remote = vi.fn().mockResolvedValue(null)
    setOpenCodeRemoteSessionWindowReader(remote)
    const result = await readNativeChatTranscriptTail({
      agent: 'opencode',
      sessionId: 'ses_1',
      limit: 5,
      executionHostId: 'ssh:vps-1'
    })
    expect(remote).toHaveBeenCalledWith('vps-1', { sessionId: 'ses_1', limit: 5 }, undefined)
    expect(result).toMatchObject({ notFound: true })
    setOpenCodeRemoteSessionWindowReader(() =>
      Promise.reject(new Error('The SSH host is not connected.'))
    )
  })
})
