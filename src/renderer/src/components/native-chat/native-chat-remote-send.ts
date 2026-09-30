// Chat send to a Remote Orca Server pane as ONE host-sequenced write.
//
// Why: the local send path writes the body and, 500 ms later, a separate Enter.
// For a runtime-owned pane each of those is its own fire-and-forget
// `terminal.send`, so the Enter crosses the network on its own and can reach the
// agent before the paste, glued into it, or mid-render — the prompt then sits
// unsent in the composer. Orca Mobile never had this: it sends the text with
// `enter: true` in a single awaited `terminal.send`, and the host writes the text,
// waits the agent-aware submit delay (scaled to the payload), and writes Enter
// right beside the PTY (runtime-terminal-writer.ts). This is that same call.
//
// Not the `agentPrompt` path: that one verifies a turn starts, which a prompt
// Claude queues mid-turn never does, so it would report healthy sends as stalled.

import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { RuntimeTerminalRead, RuntimeTerminalSend } from '../../../../shared/runtime-types'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import {
  getRemoteRuntimePtyEnvironmentId,
  getRemoteRuntimeTerminalHandle
} from '@/runtime/runtime-terminal-stream'

const DESKTOP_CLIENT = { id: 'orca-desktop', type: 'desktop' } as const
/** Covers the host's submit delay for a large paste plus the round trip. */
const REMOTE_CHAT_SEND_TIMEOUT_MS = 30_000
const REMOTE_CHAT_SCREEN_READ_TIMEOUT_MS = 5_000

export type RemoteNativeChatSendTarget = { environmentId: string; terminal: string }

/** 'unknown' = the call failed without proof the host never wrote it; never retry blind. */
export type RemoteNativeChatSendOutcome = 'accepted' | 'rejected' | 'unknown'

/** The runtime terminal behind a chat pane, or null for a local/SSH pane. */
export function remoteNativeChatSendTarget(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string
): RemoteNativeChatSendTarget | null {
  const terminal = getRemoteRuntimeTerminalHandle(ptyId)
  if (!terminal) {
    return null
  }
  const ownerEnvironmentId = getRemoteRuntimePtyEnvironmentId(ptyId)
  if (ownerEnvironmentId) {
    return { environmentId: ownerEnvironmentId, terminal }
  }
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' ? { environmentId: target.environmentId, terminal } : null
}

/** Body and Enter in one `terminal.send`; the host sequences them. */
export async function sendRemoteNativeChatPrompt(
  target: RemoteNativeChatSendTarget,
  body: string
): Promise<RemoteNativeChatSendOutcome> {
  try {
    const result = await callRuntimeRpc<{ send: RuntimeTerminalSend }>(
      { kind: 'environment', environmentId: target.environmentId },
      'terminal.send',
      { terminal: target.terminal, text: body, enter: true, client: DESKTOP_CLIENT },
      { timeoutMs: REMOTE_CHAT_SEND_TIMEOUT_MS }
    )
    return result.send.accepted === true ? 'accepted' : 'rejected'
  } catch {
    return 'unknown'
  }
}

/** The terminal's current rendered screen as the host sees it, or null. Why the
 *  host's copy: while the pane shows chat, this client's own terminal buffer can
 *  lag the PTY, and a stale frame would hide text that is still parked. */
export async function readRemoteNativeChatScreen(
  target: RemoteNativeChatSendTarget
): Promise<string | null> {
  try {
    const result = await callRuntimeRpc<{ terminal: RuntimeTerminalRead }>(
      { kind: 'environment', environmentId: target.environmentId },
      'terminal.read',
      { terminal: target.terminal, screen: true },
      { timeoutMs: REMOTE_CHAT_SCREEN_READ_TIMEOUT_MS }
    )
    return result.terminal.source === 'screen' ? result.terminal.tail.join('\n') : null
  } catch {
    return null
  }
}
