import { readOpenCodeDatabase } from '../../ai-vault/session-scanner-opencode-sqlite-open'
import { listOpenCodeDatabases } from '../../opencode-usage/opencode-database-discovery'
import {
  openCodeSessionChangeToken,
  openCodeSessionExists,
  readOpenCodeSessionWindow,
  type OpenCodeSessionWindow
} from '../../../shared/opencode-session-window'
import type { OpenCodeSessionWindowRequest } from './opencode-remote-session-window'

/** Which database last answered for a session; a session never moves between files. */
const databaseBySession = new Map<string, string>()

async function candidateDatabases(sessionId: string): Promise<string[]> {
  const known = databaseBySession.get(sessionId)
  const discovered = await listOpenCodeDatabases()
  return known ? [known, ...discovered.filter((path) => path !== known)] : discovered
}

/**
 * Reads on this machine's OpenCode databases. The reads are synchronous
 * `node:sqlite` calls but bounded: two indexed aggregates for the change token,
 * and one session's newest messages for a window — never a scan.
 */
export async function readLocalOpenCodeSessionWindow(
  request: OpenCodeSessionWindowRequest
): Promise<OpenCodeSessionWindow | null> {
  const known = databaseBySession.get(request.sessionId)
  for (const dbPath of await candidateDatabases(request.sessionId)) {
    let window: OpenCodeSessionWindow | null
    try {
      window = readOpenCodeDatabase({
        dbPath,
        read: (db) => readSession(db, request)
      })
    } catch (error) {
      // A remembered file can vanish (OpenCode rotates its db); fall through to discovery.
      if (dbPath === known) {
        databaseBySession.delete(request.sessionId)
        continue
      }
      throw error
    }
    if (window) {
      databaseBySession.set(request.sessionId, dbPath)
      return window
    }
  }
  return null
}

function readSession(
  db: Parameters<typeof openCodeSessionExists>[0],
  request: OpenCodeSessionWindowRequest
): OpenCodeSessionWindow | null {
  if (!openCodeSessionExists(db, request.sessionId)) {
    return null
  }
  if (request.tokenOnly) {
    return {
      sessionId: request.sessionId,
      messages: [],
      parts: [],
      totalMessages: 0,
      changeToken: openCodeSessionChangeToken(db, request.sessionId)
    } satisfies OpenCodeSessionWindow
  }
  return readOpenCodeSessionWindow(db, { sessionId: request.sessionId, limit: request.limit })
}
