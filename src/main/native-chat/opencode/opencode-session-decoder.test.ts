import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { readOpenCodeSessionWindow } from '../../../shared/opencode-session-window'
import {
  OPENCODE_TEST_SCHEMA,
  seedOpenCodeSession
} from '../../../shared/opencode-session-window-fixture'
import { decodeOpenCodeSessionWindow } from './opencode-session-decoder'

function seeded(turns: number): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(OPENCODE_TEST_SCHEMA)
  seedOpenCodeSession(db, 'ses_1', turns)
  return db
}

describe('decodeOpenCodeSessionWindow', () => {
  it('maps user prose, reasoning, tool call + result, and assistant prose in order', () => {
    const db = seeded(1)
    const window = readOpenCodeSessionWindow(db, { sessionId: 'ses_1', limit: 10 })!
    const decoded = decodeOpenCodeSessionWindow(window)
    expect(decoded.messages.map((m) => [m.id, m.role])).toEqual([
      ['msg_u0', 'user'],
      ['prt_r0', 'reasoning'],
      ['prt_t0', 'assistant'],
      ['prt_t0:result', 'tool'],
      ['prt_x0', 'assistant']
    ])
    expect(decoded.messages[0]?.blocks).toEqual([{ type: 'text', text: 'prompt 0' }])
    expect(decoded.messages[2]?.blocks).toEqual([
      {
        type: 'tool-call',
        name: 'read',
        input: { filePath: '/home/u/app/index.html' },
        callId: 'call_0',
        state: 'completed'
      }
    ])
    expect(decoded.messages[3]?.blocks).toEqual([{ type: 'tool-result', output: 'contents 0' }])
    expect(decoded.messages[3]?.timestamp).toBe(10_020)
    expect(decoded.lifecycle).toEqual({ state: 'completed', turnId: 'msg_a0', timestamp: 10_050 })
  })

  it('reports a turn as working until the assistant finishes, and failed tools as errors', () => {
    const db = seeded(1)
    db.prepare(
      'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)'
    ).run(
      'msg_u1',
      'ses_1',
      20_000,
      20_000,
      JSON.stringify({ role: 'user', time: { created: 20_000 } })
    )
    db.prepare(
      'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      'prt_u1',
      'msg_u1',
      'ses_1',
      20_000,
      20_000,
      JSON.stringify({ type: 'text', text: 'again' })
    )
    let decoded = decodeOpenCodeSessionWindow(
      readOpenCodeSessionWindow(db, { sessionId: 'ses_1', limit: 10 })!
    )
    expect(decoded.lifecycle).toMatchObject({ state: 'working', turnId: 'msg_u1' })

    db.prepare(
      'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)'
    ).run(
      'msg_a1',
      'ses_1',
      20_010,
      20_010,
      JSON.stringify({ role: 'assistant', parentID: 'msg_u1', time: { created: 20_010 } })
    )
    db.prepare(
      'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      'prt_t1',
      'msg_a1',
      'ses_1',
      20_011,
      20_011,
      JSON.stringify({
        type: 'tool',
        tool: 'bash',
        callID: 'c1',
        state: { status: 'error', input: { command: 'false' }, error: 'exit 1' }
      })
    )
    decoded = decodeOpenCodeSessionWindow(
      readOpenCodeSessionWindow(db, { sessionId: 'ses_1', limit: 10 })!
    )
    expect(decoded.lifecycle).toMatchObject({ state: 'working', turnId: 'msg_a1' })
    const failed = decoded.messages.find((m) => m.id === 'prt_t1:result')
    expect(failed?.blocks).toEqual([{ type: 'tool-result', output: 'exit 1', isError: true }])
    const call = decoded.messages.find((m) => m.id === 'prt_t1')
    expect(call?.blocks[0]).toMatchObject({ type: 'tool-call', state: 'failed' })
  })

  it('ignores unparseable rows and step markers without dropping the rest', () => {
    const db = seeded(1)
    db.prepare(
      'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('prt_bad', 'msg_a0', 'ses_1', 10_040, 10_040, '{not json')
    const decoded = decodeOpenCodeSessionWindow(
      readOpenCodeSessionWindow(db, { sessionId: 'ses_1', limit: 10 })!
    )
    expect(decoded.messages.map((m) => m.id)).toEqual([
      'msg_u0',
      'prt_r0',
      'prt_t0',
      'prt_t0:result',
      'prt_x0'
    ])
  })
})
