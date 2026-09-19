import { readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  clampOpenCodeSessionWindowLimit,
  OPENCODE_SESSION_WINDOW_METHOD,
  openCodeSessionChangeToken,
  openCodeSessionExists,
  readOpenCodeSessionWindow,
  type OpenCodeSessionDatabase,
  type OpenCodeSessionWindow
} from '../shared/opencode-session-window'
import { resolveOpenCodeDataDirectory } from '../main/opencode/opencode-data-directory'
import type { RelayDispatcher } from './dispatcher'

export const OPENCODE_SQLITE_UNAVAILABLE_MESSAGE =
  'OpenCode chat needs Node 22.13 or newer on this host: its node:sqlite module is unavailable.'
const OPENCODE_SESSION_ID_MAX_LENGTH = 128
const OPENCODE_DB_BUSY_TIMEOUT_MS = 1_500

type SqliteDatabase = OpenCodeSessionDatabase & { close: () => void }
type NodeSqliteDatabaseSync = new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase

const requireOptional = createRequire(__filename)
let databaseSync: NodeSqliteDatabaseSync | null | undefined

/** Why lazy: the relay serves Node 18 hosts; only this method needs `node:sqlite`. */
function loadDatabaseSync(): NodeSqliteDatabaseSync | null {
  if (databaseSync !== undefined) {
    return databaseSync
  }
  try {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: `require` answers `any`; node:sqlite exports one constructor, `DatabaseSync`, whose call shape `SqliteDatabase` declares, and the typeof check below rejects any other export.
    const loaded = requireOptional('node:sqlite') as { DatabaseSync?: NodeSqliteDatabaseSync }
    databaseSync = typeof loaded.DatabaseSync === 'function' ? loaded.DatabaseSync : null
  } catch {
    databaseSync = null
  }
  return databaseSync
}

/** The host's OpenCode databases: `OPENCODE_DB` when set, else every opencode*.db in the data dir. */
async function listHostOpenCodeDatabases(): Promise<string[]> {
  const dataDirectory = resolveOpenCodeDataDirectory(process.env, homedir())
  const override = process.env.OPENCODE_DB?.trim()
  if (override) {
    if (override === ':memory:') {
      return []
    }
    const path = isAbsolute(override) ? override : join(dataDirectory, override)
    try {
      return (await stat(path)).isFile() ? [path] : []
    } catch {
      return []
    }
  }
  try {
    const entries = await readdir(dataDirectory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && /^opencode(?:-[A-Za-z0-9_.-]+)?\.db$/.test(entry.name))
      .map((entry) => join(dataDirectory, entry.name))
      .sort()
  } catch {
    return []
  }
}

function readWindowFromDatabase(
  DatabaseSync: NodeSqliteDatabaseSync,
  dbPath: string,
  sessionId: string,
  limit: number,
  tokenOnly: boolean
): OpenCodeSessionWindow | null {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    // Why pragmas over constructor options: both exist on every node:sqlite release.
    db.prepare(`PRAGMA busy_timeout = ${OPENCODE_DB_BUSY_TIMEOUT_MS}`).get()
    db.prepare('PRAGMA query_only = ON').get()
    if (!openCodeSessionExists(db, sessionId)) {
      return null
    }
    if (tokenOnly) {
      return {
        sessionId,
        messages: [],
        parts: [],
        totalMessages: 0,
        changeToken: openCodeSessionChangeToken(db, sessionId)
      }
    }
    return readOpenCodeSessionWindow(db, { sessionId, limit })
  } finally {
    db.close()
  }
}

function parseParams(params: Record<string, unknown>): {
  sessionId: string
  limit: number
  tokenOnly: boolean
} {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId.trim() : ''
  if (!sessionId || sessionId.length > OPENCODE_SESSION_ID_MAX_LENGTH) {
    throw new Error('opencode.readSessionWindow requires a sessionId')
  }
  return {
    sessionId,
    limit: clampOpenCodeSessionWindowLimit(params.limit),
    tokenOnly: params.tokenOnly === true
  }
}

/** Serves one OpenCode session's newest messages from the host's SQLite database. */
export class OpenCodeSessionHandler {
  constructor(dispatcher: RelayDispatcher) {
    dispatcher.onRequest(OPENCODE_SESSION_WINDOW_METHOD, (params) => this.readSessionWindow(params))
  }

  async readSessionWindow(params: Record<string, unknown>): Promise<OpenCodeSessionWindow | null> {
    const { sessionId, limit, tokenOnly } = parseParams(params)
    const DatabaseSync = loadDatabaseSync()
    if (!DatabaseSync) {
      throw new Error(OPENCODE_SQLITE_UNAVAILABLE_MESSAGE)
    }
    for (const dbPath of await listHostOpenCodeDatabases()) {
      const window = readWindowFromDatabase(DatabaseSync, dbPath, sessionId, limit, tokenOnly)
      if (window) {
        return window
      }
    }
    return null
  }
}
