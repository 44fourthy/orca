import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { shouldShowNativeChatTypingIndicator } from './native-chat-typing-indicator'
import { nativeChatNarrationMessageId } from './native-chat-narration'

/**
 * What a working turn renders beside its transcript. Kept as a hook (rather than
 * inline in the list, whose body sits at the file-length cap) so the two
 * decisions stay together:
 *  - `showTypingIndicator` — normally the tail heuristic, but answer-only mode
 *    hides the very rows that heuristic looks for, so a working turn is itself
 *    the signal there;
 *  - `narrationMessageId` — the trailing prose row, rendered as a small
 *    narration line because with activity hidden it is progress talk, not the
 *    answer.
 */
export function useNativeChatWorkingChrome(args: {
  messages: readonly NativeChatMessage[]
  hideToolActivity: boolean
  isWorking: boolean
  showTurnStatus: boolean
}): { showTypingIndicator: boolean; narrationMessageId: string | undefined } {
  const { messages, hideToolActivity, isWorking, showTurnStatus } = args
  const showTypingIndicator = useMemo(() => {
    if (showTurnStatus || hideToolActivity) {
      return isWorking
    }
    return shouldShowNativeChatTypingIndicator({ messages, isWorking })
  }, [messages, hideToolActivity, isWorking, showTurnStatus])
  const narrationMessageId = useMemo(
    () => nativeChatNarrationMessageId(messages, hideToolActivity, isWorking),
    [messages, hideToolActivity, isWorking]
  )
  return { showTypingIndicator, narrationMessageId }
}
