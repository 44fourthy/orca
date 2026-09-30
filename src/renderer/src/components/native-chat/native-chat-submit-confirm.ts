// Making a chat send actually submit. Why: on a Remote Orca Server the body and
// the delayed Enter are separate fire-and-forget RPCs, and the body first
// yields to an async size check — so the Enter can reach the agent's TUI before
// the paste, glued into it, or while the TUI is busy, and be swallowed, leaving
// the prompt parked unsent in the composer (upstream #14308). Whatever the
// cause, the symptom is the same and observable: our text still on the prompt
// line after the Enter. A send in that state gets Enter again.

import { agentComposerPromptText } from './native-chat-launch-draft-send'

/** Gap after an Enter before looking at the composer to see whether it took. */
export const NATIVE_CHAT_SUBMIT_CHECK_MS = 700
/** Re-sent Enters before giving up; the undelivered warning covers the rest. */
export const NATIVE_CHAT_SUBMIT_RETRIES = 2

/** Claude collapses a long or multi-line paste into this placeholder. */
const PASTED_TEXT_PLACEHOLDER = /^\[Pasted text #\d+/
/** Enough of the prompt line to tell our text from anything else typed there. */
const PROBE_CHARS = 24
const MIN_PROBE_CHARS = 3

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Whether the rendered composer still holds this send's text. Only a readable
 * screen that positively shows our draft counts: an empty line, a dialog, or an
 * unreadable screen all mean "leave it alone", so a re-sent Enter can never land
 * on a permission prompt or submit something the user typed themselves.
 */
export function composerStillHoldsSend(screen: string | null | undefined, text: string): boolean {
  const promptText = agentComposerPromptText(screen)
  if (promptText === null) {
    return false
  }
  const shown = collapse(promptText)
  if (PASTED_TEXT_PLACEHOLDER.test(shown)) {
    return true
  }
  // The prompt line shows the start of the first line, cut short when it wraps.
  const probe = shown.slice(0, PROBE_CHARS)
  const firstLine = collapse(text.split('\n')[0] ?? '')
  return probe.length >= MIN_PROBE_CHARS && firstLine.startsWith(probe)
}

/** After the Enter, re-send it while our text is still parked, then finish. */
export function confirmNativeChatSubmit(args: {
  text: string
  readScreen?: () => string | null | undefined
  delay: (ms: number, fn: () => void) => void
  resendEnter: () => void
  done: () => void
}): void {
  const { readScreen } = args
  if (!readScreen) {
    args.done()
    return
  }
  let retries = 0
  const check = (): void => {
    let parked = false
    try {
      parked = composerStillHoldsSend(readScreen(), args.text)
    } catch {
      // Unreadable is unconfirmed; never re-send blind.
    }
    if (parked && retries < NATIVE_CHAT_SUBMIT_RETRIES) {
      retries += 1
      args.resendEnter()
      args.delay(NATIVE_CHAT_SUBMIT_CHECK_MS, check)
      return
    }
    args.done()
  }
  args.delay(NATIVE_CHAT_SUBMIT_CHECK_MS, check)
}
