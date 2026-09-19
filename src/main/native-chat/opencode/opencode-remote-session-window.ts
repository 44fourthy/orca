import type { OpenCodeSessionWindow } from '../../../shared/opencode-session-window'

export type OpenCodeSessionWindowRequest = {
  sessionId: string
  limit: number
  /** Only the change token is wanted; the host may skip the rows. */
  tokenOnly?: boolean
}

/**
 * Asks the SSH host for a session window. Resolves to null when the host does
 * not know the session, and throws when the host cannot answer (relay down,
 * relay too old, or its Node lacks `node:sqlite`).
 */
export type OpenCodeRemoteSessionWindowReader = (
  targetId: string,
  request: OpenCodeSessionWindowRequest,
  signal?: AbortSignal
) => Promise<OpenCodeSessionWindow | null>

let reader: OpenCodeRemoteSessionWindowReader = () => {
  return Promise.reject(new Error('The SSH host is not connected.'))
}

/** Registered by the SSH session registry; keeps native chat off the ipc module graph. */
export function setOpenCodeRemoteSessionWindowReader(
  next: OpenCodeRemoteSessionWindowReader
): void {
  reader = next
}

export function readRemoteOpenCodeSessionWindow(
  targetId: string,
  request: OpenCodeSessionWindowRequest,
  signal?: AbortSignal
): Promise<OpenCodeSessionWindow | null> {
  return reader(targetId, request, signal)
}
