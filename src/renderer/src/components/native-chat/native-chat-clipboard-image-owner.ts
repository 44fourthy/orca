import type { NativeChatAttachmentOwner } from './native-chat-attachment-upload'
import type { NativeChatResolvedPathOptions } from './native-chat-resolved-path-ownership'

export type NativeChatAttachResolvedPaths = (
  paths: string[],
  connectionId?: string | null,
  options?: NativeChatResolvedPathOptions
) => void

/** `targetOwned`: the pending chip's path will live on the agent's host. */
export type NativeChatBeginPendingImage = (
  previewUrl?: string,
  options?: { targetOwned?: boolean }
) => string | null

/** Owners whose attachment path is a file the agent's host can read: local and
 *  SSH save at attach time, and a runtime owner saves through the runtime's own
 *  clipboard importer, so every one of these produces a readable path. */
export function ownerAcceptsClipboardImage(
  owner: NativeChatAttachmentOwner
): owner is Extract<NativeChatAttachmentOwner, { kind: 'local' | 'ssh' | 'runtime' }> {
  return owner.kind === 'local' || owner.kind === 'ssh' || owner.kind === 'runtime'
}

/** Where a pasted clipboard image is saved: SSH panes over SFTP, runtime-owned
 *  panes through the runtime's clipboard importer, local panes locally. */
export function clipboardImageSaveTarget(
  owner: NativeChatAttachmentOwner
): { connectionId: string } | { runtimeEnvironmentId: string } | undefined {
  if (owner.kind === 'ssh') {
    return { connectionId: owner.connectionId }
  }
  return owner.kind === 'runtime' ? { runtimeEnvironmentId: owner.environmentId } : undefined
}
