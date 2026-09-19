import { describe, expect, it } from 'vitest'
import { dirname, extname } from 'node:path'
import {
  isSshTranscriptPath,
  joinSshTranscriptPath,
  parseSshTranscriptPath,
  toSshTranscriptPath
} from './ssh-transcript-path'

describe('ssh transcript path', () => {
  it('round-trips a target id and remote absolute path', () => {
    const path = toSshTranscriptPath('vps-1', '/home/colors/.claude/projects/-p/abc.jsonl')
    expect(isSshTranscriptPath(path)).toBe(true)
    expect(parseSshTranscriptPath(path)).toEqual({
      executionHostId: 'ssh:vps-1',
      targetId: 'vps-1',
      remotePath: '/home/colors/.claude/projects/-p/abc.jsonl'
    })
  })

  it('survives node path helpers the resolvers apply to it', () => {
    const path = toSshTranscriptPath('vps 1/x', '/home/u/.codex/sessions/2026/09/rollout.jsonl')
    expect(extname(path)).toBe('.jsonl')
    expect(parseSshTranscriptPath(dirname(path))?.remotePath).toBe(
      '/home/u/.codex/sessions/2026/09'
    )
    expect(joinSshTranscriptPath(dirname(path), 'other.jsonl')).toBe(
      toSshTranscriptPath('vps 1/x', '/home/u/.codex/sessions/2026/09/other.jsonl')
    )
  })

  it('rejects non-absolute remote paths and foreign spellings', () => {
    expect(() => toSshTranscriptPath('vps-1', '~/.claude/x.jsonl')).toThrow()
    expect(isSshTranscriptPath('/home/u/.claude/x.jsonl')).toBe(false)
    expect(parseSshTranscriptPath('orca-ssh-transcript:/local/x.jsonl')).toBeNull()
    expect(parseSshTranscriptPath('orca-ssh-transcript:/ssh%3A')).toBeNull()
  })
})
