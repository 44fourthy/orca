import { Dirent, Stats, constants } from 'node:fs'
import { MAX_FILE_RANGE_READ_BYTES } from '../../shared/file-range-read'
import {
  FileRangeReadUnsupportedError,
  type FileStat,
  type IFilesystemProvider
} from '../providers/filesystem-provider-contract'
import {
  getSshFilesystemProvider,
  onSshFilesystemProviderRegistered
} from '../providers/ssh-filesystem-dispatch'
import { supportsRemoteTranscriptRangeRead } from '../runtime/orchestration/worker-transcript-remote-range-read'
import { isSshRequestOutcomeUnverifiable } from '../ssh/ssh-channel-multiplexer'
import {
  parseSshTranscriptPath,
  toSshTranscriptPath,
  type SshTranscriptLocation
} from './ssh-transcript-path'
import { WslTranscriptFsError } from './wsl-transcript-fs-error'

export const SSH_TRANSCRIPT_PROVIDER_UNAVAILABLE_MESSAGE =
  'The SSH host is not connected. Chat will resume when the connection is restored.'
const SSH_TRANSCRIPT_TRANSPORT_MESSAGE =
  'The SSH host did not answer in time. Chat will resume when the connection recovers.'

/** A remote transcript opened for positional reads; carries no host handle.
 *  On a relay without ranged reads it holds one whole-file snapshot instead. */
export type SshTranscriptFsHandle = {
  readonly kind: 'ssh-transcript'
  readonly location: SshTranscriptLocation
  readonly snapshot: Buffer | null
}

/** Ranged-read support per target, probed once and forgotten when the relay reconnects. */
const rangeReadSupport = new Map<string, Promise<boolean>>()
let watchingProviderRegistrations = false

function supportsRangeReads(targetId: string, provider: IFilesystemProvider): Promise<boolean> {
  if (!watchingProviderRegistrations) {
    // Subscribed on first use, not at import: this module sits in the fs-access graph.
    watchingProviderRegistrations = true
    onSshFilesystemProviderRegistered((registered) => rangeReadSupport.delete(registered))
  }
  let probe = rangeReadSupport.get(targetId)
  if (!probe) {
    probe = supportsRemoteTranscriptRangeRead(provider).catch(() => {
      rangeReadSupport.delete(targetId)
      return false
    })
    rangeReadSupport.set(targetId, probe)
  }
  return probe
}

export function isSshTranscriptFsHandle(value: unknown): value is SshTranscriptFsHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'ssh-transcript'
  )
}

function locate(path: string): SshTranscriptLocation {
  const location = parseSshTranscriptPath(path)
  if (!location) {
    throw new Error(`Not an SSH transcript path: ${path}`)
  }
  return location
}

/**
 * Why the WSL refusal class: every reader and poll loop already treats it as
 * transient unavailability — retry, never `notFound`, never a local fallback —
 * which is exactly the verdict an unreachable host must get (ssh-execution-boundary.md).
 */
function unavailable(message: string): WslTranscriptFsError {
  return new WslTranscriptFsError('unavailable', message)
}

function providerFor(location: SshTranscriptLocation): IFilesystemProvider {
  const provider = getSshFilesystemProvider(location.targetId)
  if (!provider) {
    throw unavailable(SSH_TRANSCRIPT_PROVIDER_UNAVAILABLE_MESSAGE)
  }
  return provider
}

/** A torn-down relay never consulted the host: same verdict as a lost link. */
function isSshRelayUnreachable(error: unknown): boolean {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  return code === 'DISPOSED' || isSshRequestOutcomeUnverifiable(error)
}

/** Relay errors carry no errno; the readers key "missing" off `code === 'ENOENT'`. */
function enoent(path: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, '${path}'`)
  error.code = 'ENOENT'
  error.errno = -2
  error.path = path
  return error
}

/** Loss of contact is never evidence of absence: only a host answer may say "missing". */
async function remotePathExists(
  provider: IFilesystemProvider,
  remotePath: string
): Promise<boolean> {
  try {
    if (provider.pathsExist) {
      const [result] = await provider.pathsExist([remotePath])
      if (result && 'exists' in result) {
        return result.exists
      }
      throw unavailable(SSH_TRANSCRIPT_TRANSPORT_MESSAGE)
    }
    await provider.stat(remotePath)
    return true
  } catch (error) {
    if (error instanceof WslTranscriptFsError) {
      throw error
    }
    if (isSshRelayUnreachable(error)) {
      throw unavailable(SSH_TRANSCRIPT_TRANSPORT_MESSAGE)
    }
    if (provider.pathsExist) {
      throw error
    }
    return false
  }
}

/** Turn a failed host call into ENOENT (host says absent), a refusal (no answer), or itself. */
async function classify(
  provider: IFilesystemProvider,
  path: string,
  remotePath: string,
  error: unknown
): Promise<never> {
  if (error instanceof WslTranscriptFsError) {
    throw error
  }
  if (isSshRelayUnreachable(error)) {
    throw unavailable(SSH_TRANSCRIPT_TRANSPORT_MESSAGE)
  }
  if (!(await remotePathExists(provider, remotePath))) {
    throw enoent(path)
  }
  throw error
}

function toStats(value: FileStat): Stats {
  const mode =
    value.type === 'directory'
      ? constants.S_IFDIR
      : value.type === 'symlink'
        ? constants.S_IFLNK
        : constants.S_IFREG
  const mtimeMs = value.mtimeMs ?? value.mtime
  // Object.create keeps Stats' own predicates (isFile/isDirectory read `mode`).
  const stats: Stats = Object.create(Stats.prototype)
  return Object.assign(stats, {
    size: value.size,
    mode,
    mtimeMs,
    // Why: the relay reports no ctime; mtime is the closest stand-in the version
    // comparison can key on. The 64-byte boundary fingerprint still catches a
    // same-size in-place rewrite.
    ctimeMs: mtimeMs,
    mtime: new Date(mtimeMs),
    ctime: new Date(mtimeMs),
    dev: value.dev ?? 0,
    ino: value.ino ?? 0,
    nlink: value.nlink ?? 1
  })
}

function toDirent(parentPath: string, name: string, isDirectory: boolean, isSymlink: boolean) {
  const dirent: Dirent = Object.create(Dirent.prototype)
  return Object.assign(dirent, {
    name,
    parentPath,
    path: parentPath,
    isFile: () => !isDirectory && !isSymlink,
    // Why: the relay reports a link's target type for the explorer; session
    // walkers use lstat semantics so a cyclic link is never followed.
    isDirectory: () => isDirectory && !isSymlink,
    isSymbolicLink: () => isSymlink,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false
  })
}

export async function sshTranscriptAccess(path: string): Promise<boolean> {
  const location = locate(path)
  return remotePathExists(providerFor(location), location.remotePath)
}

export async function sshTranscriptStat(path: string): Promise<Stats> {
  const location = locate(path)
  const provider = providerFor(location)
  try {
    return toStats(await provider.stat(location.remotePath))
  } catch (error) {
    return classify(provider, path, location.remotePath, error)
  }
}

export async function sshTranscriptLstat(path: string): Promise<Stats> {
  const location = locate(path)
  const provider = providerFor(location)
  if (!provider.lstat) {
    return sshTranscriptStat(path)
  }
  try {
    return toStats(await provider.lstat(location.remotePath))
  } catch (error) {
    return classify(provider, path, location.remotePath, error)
  }
}

export async function sshTranscriptReaddir(path: string): Promise<Dirent[]> {
  const location = locate(path)
  const provider = providerFor(location)
  try {
    const entries = await provider.readDir(location.remotePath)
    return entries.map((entry) => toDirent(path, entry.name, entry.isDirectory, entry.isSymlink))
  } catch (error) {
    return classify(provider, path, location.remotePath, error)
  }
}

export async function sshTranscriptReadFile(path: string): Promise<string> {
  const location = locate(path)
  const provider = providerFor(location)
  try {
    return (await provider.readFile(location.remotePath)).content
  } catch (error) {
    return classify(provider, path, location.remotePath, error)
  }
}

/** The whole file, for hosts whose relay predates ranged reads. */
async function readSnapshot(location: SshTranscriptLocation, path: string): Promise<Buffer> {
  const provider = providerFor(location)
  try {
    return Buffer.from((await provider.readFile(location.remotePath)).content, 'utf8')
  } catch (error) {
    return classify(provider, path, location.remotePath, error)
  }
}

export async function sshTranscriptOpen(path: string): Promise<SshTranscriptFsHandle> {
  const location = locate(path)
  const provider = providerFor(location)
  if (!(await remotePathExists(provider, location.remotePath))) {
    throw enoent(path)
  }
  if (await supportsRangeReads(location.targetId, provider)) {
    return { kind: 'ssh-transcript', location, snapshot: null }
  }
  // Why one snapshot per open, never per chunk: re-reading a growing file per
  // positional read is quadratic (filesystem-provider-contract.ts).
  return { kind: 'ssh-transcript', location, snapshot: await readSnapshot(location, path) }
}

/**
 * Positional read over `fs.readFileRange`, chunked to the relay's per-call cap.
 * A short chunk means end of file, matching the FileHandle.read contract the
 * tail readers rely on.
 */
export async function sshTranscriptRead(
  handle: SshTranscriptFsHandle,
  buffer: Buffer,
  offset: number,
  length: number,
  position: number,
  signal?: AbortSignal
): Promise<{ bytesRead: number; buffer: Buffer }> {
  const provider = providerFor(handle.location)
  if (handle.snapshot || !provider.readFileRange) {
    const snapshot =
      handle.snapshot ??
      (await readSnapshot(
        handle.location,
        toSshTranscriptPath(handle.location.targetId, handle.location.remotePath)
      ))
    const bytesRead = Math.max(0, Math.min(length, snapshot.length - position))
    if (bytesRead > 0) {
      snapshot.copy(buffer, offset, position, position + bytesRead)
    }
    return { bytesRead, buffer }
  }
  let bytesRead = 0
  while (bytesRead < length) {
    signal?.throwIfAborted()
    const chunkLength = Math.min(MAX_FILE_RANGE_READ_BYTES, length - bytesRead)
    let chunk
    try {
      chunk = await provider.readFileRange(
        handle.location.remotePath,
        position + bytesRead,
        chunkLength,
        { signal }
      )
    } catch (error) {
      if (error instanceof FileRangeReadUnsupportedError) {
        rangeReadSupport.set(handle.location.targetId, Promise.resolve(false))
        const snapshot = await readSnapshot(
          handle.location,
          toSshTranscriptPath(handle.location.targetId, handle.location.remotePath)
        )
        const fromSnapshot = Math.max(
          0,
          Math.min(length - bytesRead, snapshot.length - (position + bytesRead))
        )
        if (fromSnapshot > 0) {
          snapshot.copy(
            buffer,
            offset + bytesRead,
            position + bytesRead,
            position + bytesRead + fromSnapshot
          )
        }
        return { bytesRead: bytesRead + fromSnapshot, buffer }
      }
      return classify(provider, `${handle.location.remotePath}`, handle.location.remotePath, error)
    }
    if (chunk.bytesRead === 0) {
      break
    }
    chunk.bytes.copy(buffer, offset + bytesRead, 0, chunk.bytesRead)
    bytesRead += chunk.bytesRead
    if (chunk.bytesRead < chunkLength) {
      break
    }
  }
  return { bytesRead, buffer }
}
