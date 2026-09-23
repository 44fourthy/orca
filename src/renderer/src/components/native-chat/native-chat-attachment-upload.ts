// SSH-aware resolution for composer attachments (STA-1465). The composer's
// attach surfaces (file drop, file picker, image paste) receive client-local
// paths, but an SSH worktree's agent runs on the remote host — local paths must
// be uploaded first, exactly like terminal drops (docs/terminal-drop-ssh.md).

import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { AppState } from '@/store/types'
import { reportTerminalDropUploadSkipsAndFailures } from '../terminal-pane/terminal-drop-upload-report'
import {
  findTerminalTabWorktreeId,
  resolveNativeChatFileLinkContext
} from './native-chat-file-link'
import { importExternalPathsToRuntime } from '@/runtime/runtime-file-client'
import { joinRuntimeTerminalDropDir } from '../terminal-pane/terminal-drop-worktree-path'
import {
  captureDirectSshMutationExpectation,
  type DirectSshMutationExpectation
} from '@/lib/ssh-mutation-expectation'

export type NativeChatSshAttachmentOwner = DirectSshMutationExpectation & {
  kind: 'ssh'
  connectionId: string
  worktreePath: string
}

export type NativeChatRuntimeAttachmentOwner = {
  kind: 'runtime'
  environmentId: string
  worktreeId: string
  worktreePath: string
}

export type NativeChatAttachmentOwner =
  | { kind: 'local' }
  | NativeChatSshAttachmentOwner
  /** Runtime-owned (`remote:`) panes attach only paths the runtime host itself
   *  can read: clipboard images save through the runtime's clipboard importer
   *  and dropped files upload into the worktree's `.orca/drops` there, mirroring
   *  the SSH upload. */
  | NativeChatRuntimeAttachmentOwner
  /** Store not hydrated / worktree unknown. Callers must not attach local
   *  paths in this window — the worktree may turn out to be remote, and the
   *  agent would silently receive paths it cannot read (see #6648). */
  | { kind: 'not-ready' }

type NativeChatAttachmentOwnerState = Pick<
  AppState,
  | 'folderWorkspaces'
  | 'getKnownWorktreeById'
  | 'projectGroups'
  | 'repos'
  | 'settings'
  | 'sshConnectionStates'
  | 'tabsByWorktree'
  | 'worktreesByRepo'
>

/** Resolve who owns the composer's backing worktree at attach time. Mirrors the
 *  terminal drop resolver's order: runtime owner first, then SSH vs local. */
export function resolveNativeChatAttachmentOwner(
  state: NativeChatAttachmentOwnerState,
  terminalTabId: string
): NativeChatAttachmentOwner {
  const worktreeId = findTerminalTabWorktreeId(state.tabsByWorktree, terminalTabId)
  if (!worktreeId) {
    return { kind: 'not-ready' }
  }
  return resolveNativeChatAttachmentOwnerForWorktree(state, worktreeId, terminalTabId)
}

export function resolveNativeChatAttachmentOwnerForWorktree(
  state: NativeChatAttachmentOwnerState,
  worktreeId: string,
  terminalTabId?: string
): NativeChatAttachmentOwner {
  const worktreePath = terminalTabId
    ? resolveNativeChatFileLinkContext(state, terminalTabId)?.worktreePath
    : state.getKnownWorktreeById(worktreeId)?.path
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  if (runtimeEnvironmentId) {
    // Why the path gate: the runtime drop upload destinations on
    // `${worktreePath}/.orca/drops`, so an unresolved path is not-ready rather
    // than an upload aimed at the wrong machine.
    return worktreePath
      ? { kind: 'runtime', environmentId: runtimeEnvironmentId, worktreeId, worktreePath }
      : { kind: 'not-ready' }
  }
  const connectionId = getConnectionIdFromState(state, worktreeId)
  if (connectionId === undefined) {
    return { kind: 'not-ready' }
  }
  if (connectionId === null) {
    return { kind: 'local' }
  }
  if (!worktreePath) {
    return { kind: 'not-ready' }
  }
  try {
    return {
      kind: 'ssh',
      connectionId,
      worktreePath,
      ...captureDirectSshMutationExpectation(state, connectionId)
    }
  } catch {
    // The connection's generation is gone (disconnect mid-attach). That is an
    // unknown owner, not a reason to throw out of the drop/IME handler.
    return { kind: 'not-ready' }
  }
}

export function nativeChatWorktreeNotReadyNotice(): string {
  return translate(
    'components.native-chat.composer.worktreeNotReady',
    'Worktree not ready — try again in a moment.'
  )
}

export function nativeChatAttachmentOwnerChangedNotice(): string {
  return translate(
    'components.native-chat.composer.attachmentOwnerChanged',
    'This workspace changed hosts while attaching — drop the files again.'
  )
}

export function nativeChatAttachmentUnreadableNotice(): string {
  return translate(
    'components.native-chat.composer.attachmentUnreadable',
    "Couldn't read the dropped files."
  )
}

export function nativeChatLocalAttachmentUnsupportedNotice(): string {
  return translate(
    'components.native-chat.composer.localAttachmentUnsupported',
    'Local attachments are not available for remote sessions.'
  )
}

/**
 * Upload client-local paths into `${worktreePath}/.orca/drops` on the SSH
 * remote and return the remote paths the agent can read (input order
 * preserved). Returns null when the upload IPC itself failed; per-file
 * skips/failures surface through the shared drop toasts.
 */
export async function uploadNativeChatAttachmentPaths(
  paths: string[],
  owner: NativeChatSshAttachmentOwner
): Promise<string[] | null> {
  const pending = toast.loading(
    translate(
      'components.native-chat.composer.uploadingAttachments',
      'Uploading {{value0}} file(s) to remote…',
      { value0: paths.length }
    )
  )
  try {
    const { resolvedPaths, skipped, failed } = await window.api.fs.resolveDroppedPathsForAgent({
      paths,
      worktreePath: owner.worktreePath,
      connectionId: owner.connectionId,
      expectedExecutionHostId: owner.expectedExecutionHostId,
      expectedSshTargetId: owner.expectedSshTargetId,
      expectedSshConnectionGeneration: owner.expectedSshConnectionGeneration
    })
    reportTerminalDropUploadSkipsAndFailures(skipped, failed)
    return resolvedPaths
  } catch (err) {
    toast.error(extractIpcErrorMessage(err, 'Failed to upload files.'))
    return null
  } finally {
    toast.dismiss(pending)
  }
}

/**
 * Upload client-local paths into `${worktreePath}/.orca/drops` on the runtime
 * host and return the runtime paths the agent can read (input order preserved),
 * mirroring the SSH upload above. Returns null when the import itself failed;
 * per-file skips/failures surface through the shared drop toasts.
 */
export async function uploadNativeChatRuntimeAttachmentPaths(args: {
  paths: string[]
  owner: NativeChatRuntimeAttachmentOwner
  settings: NativeChatAttachmentOwnerState['settings']
  assertCurrent?: () => void
}): Promise<string[] | null> {
  const { paths, owner } = args
  const pending = toast.loading(
    translate(
      'components.native-chat.composer.uploadingAttachmentsRuntime',
      'Uploading {{value0}} file(s) to the runtime…',
      { value0: paths.length }
    )
  )
  try {
    const { results } = await importExternalPathsToRuntime(
      {
        // Why: drops into an existing worktree follow the worktree's runtime
        // owner, not whichever host the sidebar currently has focused.
        settings: { ...args.settings, activeRuntimeEnvironmentId: owner.environmentId },
        worktreeId: owner.worktreeId,
        worktreePath: owner.worktreePath
      },
      paths,
      joinRuntimeTerminalDropDir(owner.worktreePath),
      { assertCurrent: args.assertCurrent }
    )
    reportTerminalDropUploadSkipsAndFailures(
      results.filter((result) => result.status === 'skipped'),
      results.filter((result) => result.status === 'failed')
    )
    return results
      .filter((result) => result.status === 'imported')
      .map((result) => result.destPath)
  } catch (err) {
    toast.error(extractIpcErrorMessage(err, 'Failed to upload files.'))
    return null
  } finally {
    toast.dismiss(pending)
  }
}
