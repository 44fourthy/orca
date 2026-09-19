import type { DatabaseSync } from 'node:sqlite'

export const OPENCODE_TEST_SCHEMA = `
CREATE TABLE session (id text PRIMARY KEY, project_id text NOT NULL, directory text NOT NULL, title text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL);
CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL);
CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL);
`

export function seedOpenCodeSession(db: DatabaseSync, sessionId: string, turns: number): void {
  db.prepare(
    'INSERT INTO session (id, project_id, directory, title, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sessionId, 'proj', '/home/u/app', 'Seeded', 1_000, 1_000)
  const message = db.prepare(
    'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)'
  )
  const part = db.prepare(
    'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (let turn = 0; turn < turns; turn += 1) {
    const base = 10_000 + turn * 100
    const userId = `msg_u${turn}`
    const assistantId = `msg_a${turn}`
    message.run(
      userId,
      sessionId,
      base,
      base,
      JSON.stringify({ role: 'user', time: { created: base } })
    )
    part.run(
      `prt_u${turn}`,
      userId,
      sessionId,
      base,
      base,
      JSON.stringify({ type: 'text', text: `prompt ${turn}` })
    )
    message.run(
      assistantId,
      sessionId,
      base + 10,
      base + 50,
      JSON.stringify({
        role: 'assistant',
        parentID: userId,
        time: { created: base + 10, completed: base + 50 },
        finish: 'stop'
      })
    )
    part.run(
      `prt_s${turn}`,
      assistantId,
      sessionId,
      base + 11,
      base + 11,
      JSON.stringify({ type: 'step-start' })
    )
    part.run(
      `prt_r${turn}`,
      assistantId,
      sessionId,
      base + 12,
      base + 12,
      JSON.stringify({ type: 'reasoning', text: `thinking ${turn}` })
    )
    part.run(
      `prt_t${turn}`,
      assistantId,
      sessionId,
      base + 13,
      base + 20,
      JSON.stringify({
        type: 'tool',
        tool: 'read',
        callID: `call_${turn}`,
        state: {
          status: 'completed',
          input: { filePath: '/home/u/app/index.html' },
          output: `contents ${turn}`,
          time: { start: base + 13, end: base + 20 }
        }
      })
    )
    part.run(
      `prt_x${turn}`,
      assistantId,
      sessionId,
      base + 30,
      base + 30,
      JSON.stringify({ type: 'text', text: `reply ${turn}` })
    )
    part.run(
      `prt_f${turn}`,
      assistantId,
      sessionId,
      base + 50,
      base + 50,
      JSON.stringify({ type: 'step-finish', reason: 'stop' })
    )
  }
}
