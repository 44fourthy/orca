type RemoteHomeResolver = (targetId: string) => string | null

let resolver: RemoteHomeResolver = () => null

/** Registered by the SSH session registry; keeps native chat off the ipc module graph. */
export function setSshTranscriptRemoteHomeResolver(next: RemoteHomeResolver): void {
  resolver = next
}

/** The SSH host's own `$HOME` as read on the host, or null until its relay reports it. */
export function resolveSshTranscriptRemoteHome(targetId: string): string | null {
  return resolver(targetId)
}
