/**
 * The slice of an OpenCode SQLite database native chat renders: one session's
 * newest messages and their parts, as raw rows. Shared by the local reader and
 * the SSH relay so both hosts answer with the same shape and the client decodes
 * once. Requires OpenCode >= 1.17 (SQLite storage).
 */

export const OPENCODE_SESSION_WINDOW_METHOD = 'opencode.readSessionWindow' as const
export const OPENCODE_SESSION_WINDOW_LIMIT_MAX = 2_000

export type OpenCodeMessageRow = {
  id: string
  timeCreated: number
  timeUpdated: number
  /** The `message.data` JSON column, verbatim. */
  data: string
}

export type OpenCodePartRow = {
  id: string
  messageId: string
  timeCreated: number
  timeUpdated: number
  /** The `part.data` JSON column, verbatim. */
  data: string
}

export type OpenCodeSessionWindow = {
  sessionId: string
  /** Oldest first; the newest `limit` messages of the session. */
  messages: OpenCodeMessageRow[]
  /** Every part of those messages, oldest first. */
  parts: OpenCodePartRow[]
  /** Messages in the whole session, so a window can report `hasMore`. */
  totalMessages: number
  /** Changes whenever any row of the session changes; cheap to compute. */
  changeToken: string
}

/** The two `node:sqlite` calls the reader needs, so tests can stub a database. */
export type OpenCodeSessionStatement = {
  all(...params: (string | number)[]): unknown[]
  get(...params: (string | number)[]): unknown
}
export type OpenCodeSessionDatabase = {
  prepare(sql: string): OpenCodeSessionStatement
}

export type OpenCodeSessionWindowParams = {
  sessionId: string
  limit: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : 0
}

export function clampOpenCodeSessionWindowLimit(limit: unknown): number {
  const numeric = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 0
  return Math.max(1, Math.min(OPENCODE_SESSION_WINDOW_LIMIT_MAX, numeric || 1))
}

export function openCodeSessionExists(db: OpenCodeSessionDatabase, sessionId: string): boolean {
  return db.prepare('SELECT 1 AS present FROM session WHERE id = ?').get(sessionId) !== undefined
}

/**
 * A token that moves when any message or part of the session is inserted or
 * updated. Two indexed aggregate queries; the whole poll loop runs on this.
 */
export function openCodeSessionChangeToken(db: OpenCodeSessionDatabase, sessionId: string): string {
  const message = asRecord(
    db
      .prepare(
        'SELECT COUNT(*) AS count, COALESCE(MAX(time_updated), 0) AS updated FROM message WHERE session_id = ?'
      )
      .get(sessionId)
  )
  const part = asRecord(
    db
      .prepare(
        'SELECT COUNT(*) AS count, COALESCE(MAX(time_updated), 0) AS updated FROM part WHERE session_id = ?'
      )
      .get(sessionId)
  )
  return [
    asNumber(message?.count),
    asNumber(message?.updated),
    asNumber(part?.count),
    asNumber(part?.updated)
  ].join(':')
}

/** Null when the session does not exist in this database. */
export function readOpenCodeSessionWindow(
  db: OpenCodeSessionDatabase,
  params: OpenCodeSessionWindowParams
): OpenCodeSessionWindow | null {
  const { sessionId } = params
  if (!openCodeSessionExists(db, sessionId)) {
    return null
  }
  const limit = clampOpenCodeSessionWindowLimit(params.limit)
  const total = asRecord(
    db.prepare('SELECT COUNT(*) AS count FROM message WHERE session_id = ?').get(sessionId)
  )
  // Newest first from the index, then flipped so consumers read a transcript.
  const messageRows = db
    .prepare(
      'SELECT id, time_created, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created DESC, id DESC LIMIT ?'
    )
    .all(sessionId, limit)
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      id: asString(row.id),
      timeCreated: asNumber(row.time_created),
      timeUpdated: asNumber(row.time_updated),
      data: asString(row.data)
    }))
    // Oldest first for the caller; `toReversed` is Node 20+, which the relay's Node 18 floor lacks.
    .sort((a, b) => a.timeCreated - b.timeCreated || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const partRows =
    messageRows.length === 0
      ? []
      : db
          .prepare(
            `SELECT id, message_id, time_created, time_updated, data FROM part WHERE session_id = ? AND message_id IN (${messageRows.map(() => '?').join(', ')}) ORDER BY time_created ASC, id ASC`
          )
          .all(sessionId, ...messageRows.map((row) => row.id))
          .map(asRecord)
          .filter((row): row is Record<string, unknown> => row !== null)
          .map((row) => ({
            id: asString(row.id),
            messageId: asString(row.message_id),
            timeCreated: asNumber(row.time_created),
            timeUpdated: asNumber(row.time_updated),
            data: asString(row.data)
          }))
  return {
    sessionId,
    messages: messageRows,
    parts: partRows,
    totalMessages: asNumber(total?.count),
    changeToken: openCodeSessionChangeToken(db, sessionId)
  }
}

/** Validate a window that crossed the relay wire; anything else is a malformed reply. */
export function parseOpenCodeSessionWindow(value: unknown): OpenCodeSessionWindow | null {
  const record = asRecord(value)
  if (!record || typeof record.sessionId !== 'string') {
    return null
  }
  if (!Array.isArray(record.messages) || !Array.isArray(record.parts)) {
    return null
  }
  const messages: OpenCodeMessageRow[] = []
  for (const item of record.messages) {
    const row = asRecord(item)
    if (!row || typeof row.id !== 'string' || typeof row.data !== 'string') {
      return null
    }
    messages.push({
      id: row.id,
      timeCreated: asNumber(row.timeCreated),
      timeUpdated: asNumber(row.timeUpdated),
      data: row.data
    })
  }
  const parts: OpenCodePartRow[] = []
  for (const item of record.parts) {
    const row = asRecord(item)
    if (
      !row ||
      typeof row.id !== 'string' ||
      typeof row.messageId !== 'string' ||
      typeof row.data !== 'string'
    ) {
      return null
    }
    parts.push({
      id: row.id,
      messageId: row.messageId,
      timeCreated: asNumber(row.timeCreated),
      timeUpdated: asNumber(row.timeUpdated),
      data: row.data
    })
  }
  return {
    sessionId: record.sessionId,
    messages,
    parts,
    totalMessages: asNumber(record.totalMessages),
    changeToken: asString(record.changeToken)
  }
}
