import { posix } from 'node:path'
import { parseExecutionHostId, toSshExecutionHostId } from '../../shared/execution-host'

/**
 * Spelling for a transcript that lives on a user SSH host and is read over the
 * relay: `orca-ssh-transcript:/<encoded execution host id><absolute remote path>`.
 * A single slash after the scheme keeps `path.join`/`dirname`/`extname` honest
 * (they would collapse `//`), and the remote part stays POSIX-absolute.
 */
export const SSH_TRANSCRIPT_PATH_SCHEME = 'orca-ssh-transcript:/'

export type SshTranscriptLocation = {
  executionHostId: string
  targetId: string
  remotePath: string
}

export function isSshTranscriptPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && path.startsWith(SSH_TRANSCRIPT_PATH_SCHEME)
}

export function toSshTranscriptPath(targetId: string, remotePath: string): string {
  const normalized = posix.normalize(remotePath.trim())
  if (!posix.isAbsolute(normalized)) {
    throw new Error(`SSH transcript paths must be absolute on the host: ${remotePath}`)
  }
  return `${SSH_TRANSCRIPT_PATH_SCHEME}${encodeURIComponent(toSshExecutionHostId(targetId))}${normalized}`
}

export function parseSshTranscriptPath(path: string): SshTranscriptLocation | null {
  if (!isSshTranscriptPath(path)) {
    return null
  }
  const rest = path.slice(SSH_TRANSCRIPT_PATH_SCHEME.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) {
    return null
  }
  let executionHostId: string
  try {
    executionHostId = decodeURIComponent(rest.slice(0, slash))
  } catch {
    return null
  }
  const parsed = parseExecutionHostId(executionHostId)
  if (parsed?.kind !== 'ssh') {
    return null
  }
  return { executionHostId, targetId: parsed.targetId, remotePath: rest.slice(slash) }
}

/** Join under an SSH transcript directory, keeping the scheme prefix intact. */
export function joinSshTranscriptPath(base: string, ...segments: string[]): string {
  const location = parseSshTranscriptPath(base)
  if (!location) {
    throw new Error(`Not an SSH transcript path: ${base}`)
  }
  return toSshTranscriptPath(location.targetId, posix.join(location.remotePath, ...segments))
}
