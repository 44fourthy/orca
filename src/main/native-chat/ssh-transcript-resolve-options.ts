import { posix } from 'node:path'
import { parseExecutionHostId } from '../../shared/execution-host'
import { resolveGrokSessionsDir } from '../../shared/grok-session-paths'
import type { ResolveSessionFileOptions } from './session-file-resolver'
import { toSshTranscriptPath } from './ssh-transcript-path'
import { resolveSshTranscriptRemoteHome } from './ssh-transcript-remote-home'

/**
 * The resolve options a reader should use right now for these args: the SSH
 * route is recomputed each time so a host whose `$HOME` the relay had not yet
 * reported, or a `~/` hook path, resolves on a later attempt.
 */
export function applySshTranscriptRoute<T extends ResolveSessionFileOptions>(args: T): T {
  const route = sshTranscriptResolveOptions(
    args.executionHostId,
    args.transcriptPath,
    resolveSshTranscriptRemoteHome
  )
  return route.kind === 'ssh' ? { ...args, ...route.options } : args
}

export type SshTranscriptResolveOptionsResult =
  | { kind: 'local' }
  | { kind: 'ssh'; options: ResolveSessionFileOptions }

/**
 * Point every transcript lookup for a session that runs on a user SSH host at
 * that host: the hook's remote path and, once the host's `$HOME` is known, the
 * per-provider sessions roots — all spelled as SSH transcript paths so the gated
 * fs layer routes them over the relay instead of probing this machine's disk.
 * Before the relay has reported the home (or while it is down) the exact hook
 * path is still polled and nothing falls back to local roots.
 *
 * Known limit: the id scanners join with the platform `path`, so on a Windows
 * client only the hook-disclosed path (Claude/Codex) resolves over SSH.
 */
export function sshTranscriptResolveOptions(
  executionHostId: string | null | undefined,
  transcriptPath: string | undefined,
  resolveRemoteHome: (targetId: string) => string | null
): SshTranscriptResolveOptionsResult {
  const host = parseExecutionHostId(executionHostId)
  if (host?.kind !== 'ssh') {
    return { kind: 'local' }
  }
  const ssh = (remotePath: string): string => toSshTranscriptPath(host.targetId, remotePath)
  // Only a POSIX-absolute home can be spelled as an SSH transcript path; a Windows
  // host (`C:\\Users\\…`) keeps the exact hook path and gets no scan roots.
  const rawHome = resolveRemoteHome(host.targetId)?.trim() || null
  const remoteHome = rawHome && posix.isAbsolute(rawHome) ? rawHome : null
  const hookPath = transcriptPath?.trim()
  const remoteHookPath = hookPath
    ? posix.isAbsolute(hookPath)
      ? hookPath
      : remoteHome && hookPath.startsWith('~/')
        ? posix.join(remoteHome, hookPath.slice(2))
        : undefined
    : undefined
  const roots: ResolveSessionFileOptions = remoteHome
    ? {
        claudeProjectsDir: ssh(posix.join(remoteHome, '.claude', 'projects')),
        // Why: the managed Codex home is a local Orca construct; a relay-launched
        // Codex writes rollouts under its own default home on the host.
        codexSessionsDirs: [ssh(posix.join(remoteHome, '.codex', 'sessions'))],
        // The host's environment is not visible here, so only the default layout applies.
        grokSessionsDir: ssh(resolveGrokSessionsDir({}, remoteHome)),
        ompSessionsDir: ssh(posix.join(remoteHome, '.omp', 'agent', 'sessions'))
      }
    : {}
  return {
    kind: 'ssh',
    options: {
      transcriptPath: remoteHookPath ? ssh(remoteHookPath) : undefined,
      remoteOnly: true,
      executionHostId: host.id,
      ...roots
    }
  }
}
