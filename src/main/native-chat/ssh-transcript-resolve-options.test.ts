import { describe, expect, it } from 'vitest'
import { toSshTranscriptPath } from './ssh-transcript-path'
import { sshTranscriptResolveOptions } from './ssh-transcript-resolve-options'

describe('sshTranscriptResolveOptions', () => {
  it('leaves local and runtime hosts on the local path', () => {
    expect(sshTranscriptResolveOptions(undefined, '/x.jsonl', () => '/h')).toEqual({
      kind: 'local'
    })
    expect(sshTranscriptResolveOptions('local', '/x.jsonl', () => '/h')).toEqual({ kind: 'local' })
    expect(sshTranscriptResolveOptions('runtime:env', '/x.jsonl', () => '/h')).toEqual({
      kind: 'local'
    })
  })

  it('points the hook path and every provider root at the remote home', () => {
    const route = sshTranscriptResolveOptions(
      'ssh:vps-1',
      '/home/u/.claude/projects/-p/s.jsonl',
      () => '/home/u'
    )
    expect(route).toEqual({
      kind: 'ssh',
      options: {
        transcriptPath: toSshTranscriptPath('vps-1', '/home/u/.claude/projects/-p/s.jsonl'),
        remoteOnly: true,
        executionHostId: 'ssh:vps-1',
        claudeProjectsDir: toSshTranscriptPath('vps-1', '/home/u/.claude/projects'),
        codexSessionsDirs: [toSshTranscriptPath('vps-1', '/home/u/.codex/sessions')],
        grokSessionsDir: toSshTranscriptPath('vps-1', '/home/u/.grok/sessions'),
        ompSessionsDir: toSshTranscriptPath('vps-1', '/home/u/.omp/agent/sessions')
      }
    })
  })

  it('expands a tilde hook path against the remote home and drops a relative one', () => {
    const tilde = sshTranscriptResolveOptions(
      'ssh:vps-1',
      '~/.codex/sessions/r.jsonl',
      () => '/home/u'
    )
    expect(tilde.kind === 'ssh' && tilde.options.transcriptPath).toBe(
      toSshTranscriptPath('vps-1', '/home/u/.codex/sessions/r.jsonl')
    )
    const relative = sshTranscriptResolveOptions('ssh:vps-1', 'sessions/r.jsonl', () => '/home/u')
    expect(relative.kind === 'ssh' && relative.options.transcriptPath).toBeUndefined()
  })

  it('keeps the exact hook path and forbids local roots while the host home is unknown', () => {
    expect(sshTranscriptResolveOptions('ssh:vps-1', '/home/u/s.jsonl', () => null)).toEqual({
      kind: 'ssh',
      options: {
        transcriptPath: toSshTranscriptPath('vps-1', '/home/u/s.jsonl'),
        remoteOnly: true,
        executionHostId: 'ssh:vps-1'
      }
    })
  })
})
