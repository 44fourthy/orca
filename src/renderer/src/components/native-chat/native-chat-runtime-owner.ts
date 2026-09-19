import {
  getRuntimeEnvironmentIdForWorktree,
  type WorktreeRuntimeOwnerState
} from '@/lib/worktree-runtime-owner'
import type { AppState } from '@/store/types'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { isRuntimeOwnedSshTargetId, toSshExecutionHostId } from '../../../../shared/execution-host'
import { findTerminalTabWorktreeId } from './native-chat-file-link'

export type NativeChatRuntimeOwnerState = Pick<AppState, 'tabsByWorktree'> &
  WorktreeRuntimeOwnerState

/**
 * The runtime owner id for a Native Chat pane, as a primitive — non-null only for
 * `runtime:` hosts (Model B), null for local and `ssh:` (Model A stays local).
 *
 * KTD-1: intentionally decoupled from `resolveNativeChatFileLinkContext`, which
 * returns null whenever the worktree *path* can't resolve (store hydration, folder
 * scopes, a remote worktree whose path hasn't landed). In that window the owner is
 * still knowable and the transport must route to the runtime — reusing the
 * path-coupled context would fall back to local session data, the exact bug this
 * kills. Resolve the owner from the tab→worktree mapping alone; do not merge the
 * two selections. The shared helper (`findTerminalTabWorktreeId`) is the right
 * level of reuse.
 */
export function selectNativeChatRuntimeEnvironmentId(
  state: NativeChatRuntimeOwnerState,
  terminalTabId: string
): string | null {
  const worktreeId = findTerminalTabWorktreeId(state.tabsByWorktree, terminalTabId)
  return worktreeId ? getRuntimeEnvironmentIdForWorktree(state, worktreeId) : null
}

export type NativeChatSshHostState = Pick<AppState, 'tabsByWorktree'> &
  Parameters<typeof getConnectionIdFromState>[0]

/**
 * The `ssh:` execution host for a Native Chat pane on a user SSH target, or null
 * for local panes and runtime-owned (ephemeral VM) targets. The local IPC path
 * hands it to main so the transcript is read over that host's relay.
 */
export function selectNativeChatSshExecutionHostId(
  state: NativeChatSshHostState,
  terminalTabId: string
): string | null {
  const worktreeId = findTerminalTabWorktreeId(state.tabsByWorktree, terminalTabId)
  if (!worktreeId) {
    return null
  }
  const connectionId = getConnectionIdFromState(state, worktreeId)
  return connectionId && !isRuntimeOwnedSshTargetId(connectionId)
    ? toSshExecutionHostId(connectionId)
    : null
}
