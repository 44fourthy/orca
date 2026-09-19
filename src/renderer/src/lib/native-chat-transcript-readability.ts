/**
 * Whether a pane's agent transcript can be read for native chat. Local panes read
 * the disk directly; a user SSH target's transcript is read over that host's
 * relay (main's ssh-transcript-fs route), and a runtime-owned target reads on its
 * own host. Only an unresolved connection (`undefined`) is unreadable.
 */
export function isNativeChatTranscriptLocalReadable(
  connectionId: string | null | undefined
): boolean {
  return connectionId !== undefined
}
