import { mkdtemp, rm, writeFile, stat as fsStat, readdir, readFile, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DirEntry } from '../../shared/filesystem-entry-types'
import type { FileStat, IFilesystemProvider } from '../providers/filesystem-provider-contract'
import {
  registerSshFilesystemProvider,
  unregisterSshFilesystemProvider
} from '../providers/ssh-filesystem-dispatch'
import { readNativeChatTranscriptTail } from './transcript-tail-reader'
import { resolveSessionFilePath } from './session-file-resolver'
import { toSshTranscriptPath } from './ssh-transcript-path'
import { sshTranscriptResolveOptions } from './ssh-transcript-resolve-options'
import { sshTranscriptRead, sshTranscriptStat, sshTranscriptOpen } from './ssh-transcript-fs'
import { wslGatedReaddir, wslGatedStat } from './wsl-transcript-fs-access'
import { WslTranscriptFsError } from './wsl-transcript-fs-error'

const TARGET = 'vps-test'
let root = ''
const calls: string[] = []

/** A relay stand-in: serves a local temp tree as if it were the remote host. */
function fakeProvider(remoteRoot: string): IFilesystemProvider {
  const local = (remotePath: string): string => join(remoteRoot, remotePath.replace(/^\//, ''))
  const toStat = async (remotePath: string): Promise<FileStat> => {
    const s = await fsStat(local(remotePath))
    return {
      size: s.size,
      type: s.isDirectory() ? 'directory' : 'file',
      mtime: s.mtimeMs,
      mtimeMs: s.mtimeMs,
      dev: s.dev,
      ino: s.ino
    }
  }
  const unsupported = (): Promise<never> => Promise.reject(new Error('not exercised here'))
  const provider: IFilesystemProvider = {
    writeFile: unsupported,
    writeFileBase64: unsupported,
    writeFileBase64Chunk: unsupported,
    deletePath: unsupported,
    createFile: unsupported,
    createDir: unsupported,
    createDirNoClobber: unsupported,
    rename: unsupported,
    renameNoClobber: unsupported,
    copy: unsupported,
    realpath: unsupported,
    search: unsupported,
    listFiles: unsupported,
    watch: unsupported,
    stat: (p) => {
      calls.push(`stat ${p}`)
      return toStat(p)
    },
    pathsExist: async (paths) => {
      calls.push(`exists ${paths.join(',')}`)
      return Promise.all(
        paths.map(async (p) => {
          try {
            await fsStat(local(p))
            return { exists: true }
          } catch {
            return { exists: false }
          }
        })
      )
    },
    readDir: async (p): Promise<DirEntry[]> => {
      calls.push(`readDir ${p}`)
      const entries = await readdir(local(p), { withFileTypes: true })
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isSymlink: e.isSymbolicLink()
      }))
    },
    readFile: async (p) => ({ content: await readFile(local(p), 'utf8'), isBinary: false }),
    readFileRange: async (p, position, length) => {
      calls.push(`range ${p} ${position}+${length}`)
      const handle = await open(local(p), 'r')
      try {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, position)
        return { bytes: buffer.subarray(0, bytesRead), bytesRead }
      } finally {
        await handle.close()
      }
    },
    supportsFileRangeRead: async () => true
  }
  return provider
}

function jsonl(records: unknown[]): string {
  return `${records.map((r) => JSON.stringify(r)).join('\n')}\n`
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-ssh-transcript-'))
  calls.length = 0
  registerSshFilesystemProvider(TARGET, fakeProvider(root))
})

afterEach(async () => {
  unregisterSshFilesystemProvider(TARGET)
  await rm(root, { recursive: true, force: true })
})

describe('ssh transcript fs', () => {
  it('reads a Claude transcript through the real tail reader over the relay provider', async () => {
    const projects = join(root, 'home/colors/.claude/projects/-home-colors-app')
    await mkdirp(projects)
    await writeFile(
      join(projects, 'sess-1.jsonl'),
      jsonl([
        {
          type: 'user',
          uuid: 'u-1',
          timestamp: '2026-09-19T10:00:00.000Z',
          message: { role: 'user', content: 'hello from the box' }
        },
        {
          type: 'assistant',
          uuid: 'a-1',
          timestamp: '2026-09-19T10:00:05.000Z',
          message: { role: 'assistant', content: [{ type: 'text', text: 'hi from the relay' }] }
        }
      ])
    )
    const remote = '/home/colors/.claude/projects/-home-colors-app/sess-1.jsonl'
    const route = sshTranscriptResolveOptions('ssh:vps-test', remote, () => '/home/colors')
    expect(route.kind).toBe('ssh')
    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: 'sess-1',
      ...(route.kind === 'ssh' ? route.options : {}),
      limit: 40
    })
    expect(result).toMatchObject({
      messages: [{ id: 'u-1' }, { id: 'a-1' }],
      hasMore: false
    })
    // Nothing touched this machine's ~/.claude: every read went to the provider.
    expect(calls.some((c) => c.startsWith('range /home/colors/.claude'))).toBe(true)
  })

  it('finds a scan-based session under the remote home when no hook path is known', async () => {
    const projects = join(root, 'home/colors/.claude/projects/-slug')
    await mkdirp(projects)
    await writeFile(join(projects, 'scan-9.jsonl'), jsonl([{ type: 'user', uuid: 'u' }]))
    const route = sshTranscriptResolveOptions('ssh:vps-test', undefined, () => '/home/colors')
    const resolved = await resolveSessionFilePath(
      'claude',
      'scan-9',
      route.kind === 'ssh' ? route.options : {}
    )
    expect(resolved).toBe(
      toSshTranscriptPath(TARGET, '/home/colors/.claude/projects/-slug/scan-9.jsonl')
    )
  })

  it('maps a missing remote file to ENOENT so readers report not-found, not a crash', async () => {
    const path = toSshTranscriptPath(TARGET, '/home/colors/.claude/projects/x/missing.jsonl')
    await expect(sshTranscriptStat(path)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(sshTranscriptOpen(path)).rejects.toMatchObject({ code: 'ENOENT' })
    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: 'nope',
      filePath: path,
      limit: 10
    })
    expect(result).toMatchObject({ notFound: true })
  })

  it('serves Stats and Dirent shapes the gated layer consumers expect', async () => {
    const dir = join(root, 'home/colors/.omp/agent/sessions')
    await mkdirp(dir)
    await writeFile(join(dir, 'a.jsonl'), 'x')
    const remoteDir = toSshTranscriptPath(TARGET, '/home/colors/.omp/agent/sessions')
    const stats = await wslGatedStat(remoteDir, 'exact')
    expect(stats.isDirectory()).toBe(true)
    expect(stats.ctimeMs).toBe(stats.mtimeMs)
    const entries = await wslGatedReaddir(remoteDir, 'scan')
    expect(entries.map((e) => [e.name, e.isFile(), e.isDirectory()])).toEqual([
      ['a.jsonl', true, false]
    ])
  })

  it('chunks positional reads to the relay cap and stops at a short read', async () => {
    const dir = join(root, 'big')
    await mkdirp(dir)
    const body = Buffer.alloc(300 * 1024, 0x61)
    await writeFile(join(dir, 'big.jsonl'), body)
    const handle = await sshTranscriptOpen(toSshTranscriptPath(TARGET, '/big/big.jsonl'))
    const buffer = Buffer.alloc(400 * 1024)
    const { bytesRead } = await sshTranscriptRead(handle, buffer, 0, buffer.length, 0)
    expect(bytesRead).toBe(body.length)
    expect(calls.filter((c) => c.startsWith('range /big/big.jsonl')).length).toBe(2)
  })

  it('reports an unregistered host as a retryable refusal, never as missing', async () => {
    unregisterSshFilesystemProvider(TARGET)
    const path = toSshTranscriptPath(TARGET, '/home/colors/x.jsonl')
    await expect(sshTranscriptStat(path)).rejects.toBeInstanceOf(WslTranscriptFsError)
    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: 'x',
      filePath: path,
      limit: 10
    })
    expect(result).toMatchObject({ error: expect.stringMatching(/not connected/) })
    expect(result).not.toHaveProperty('notFound')
  })

  it('treats a lost connection as unverifiable rather than absent', async () => {
    const lost = Object.assign(new Error('connection lost'), { code: 'CONNECTION_LOST' })
    const failing = fakeProvider(root)
    failing.stat = () => Promise.reject(lost)
    failing.pathsExist = () => Promise.reject(lost)
    registerSshFilesystemProvider(TARGET, failing)
    await expect(
      sshTranscriptStat(toSshTranscriptPath(TARGET, '/home/colors/x.jsonl'))
    ).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('never scans this machine for a remote-only session without remote roots', async () => {
    const resolved = await resolveSessionFilePath('claude', 'any-id', { remoteOnly: true })
    expect(resolved).toBeNull()
  })
})

async function mkdirp(dir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
}
