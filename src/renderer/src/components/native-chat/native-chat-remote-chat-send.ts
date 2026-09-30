// Chat send to a Remote Orca Server pane: clear the input line, then body and
// Enter in ONE host-sequenced `terminal.send`, then confirm the Enter took.
//
// Why: the local path writes the body and, 500 ms later, a separate Enter. On a
// runtime pane each is its own network call, and even when the body is awaited
// the Enter can reach Claude while it is still taking in a long paste — it is
// swallowed and the prompt sits unsent in the terminal until the user presses
// Enter there. The host sequences body and Enter beside the PTY with its
// agent-aware delay (as Orca Mobile does), and a readable screen that still
// shows our text parked gets Enter again, at most twice.

import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import type { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { NATIVE_CHAT_SUBMIT_DELAY_MS } from '../../../../shared/native-chat-answer-stepping'
import { buildNativeChatPasteBytes, NATIVE_CHAT_SUBMIT } from './native-chat-send'
import {
  clearConfirmDurationMs,
  clearThenWrite,
  clearUnsubmittedAgentInput,
  type NativeChatSendOptions
} from './native-chat-input-clear'
import {
  enqueueNativeChatPtySend,
  type NativeChatPtySendQueueHandle
} from './native-chat-pty-send-queue'
import {
  sendRemoteNativeChatPrompt,
  type RemoteNativeChatSendTarget
} from './native-chat-remote-send'
import {
  confirmNativeChatSubmit,
  NATIVE_CHAT_SUBMIT_CHECK_MS,
  NATIVE_CHAT_SUBMIT_RETRIES
} from './native-chat-submit-confirm'

export function sendNativeChatRemoteMessage(
  settings: ReturnType<typeof getSettingsForAgentTabRuntimeOwner>,
  ptyId: string,
  text: string,
  target: RemoteNativeChatSendTarget,
  options?: NativeChatSendOptions
): NativeChatPtySendQueueHandle {
  const confirmMs = options?.readScreen
    ? NATIVE_CHAT_SUBMIT_CHECK_MS * (NATIVE_CHAT_SUBMIT_RETRIES + 1)
    : 0
  return enqueueNativeChatPtySend(
    ptyId,
    NATIVE_CHAT_SUBMIT_DELAY_MS + clearConfirmDurationMs(options) + confirmMs,
    ({ isCancelled, delay, markSubmitted }) => {
      if (isCancelled()) {
        return
      }
      clearThenWrite(settings, ptyId, options, delay, () => {
        if (isCancelled()) {
          return
        }
        void sendRemoteNativeChatPrompt(target, buildNativeChatPasteBytes(text)).then((outcome) => {
          if (isCancelled()) {
            return
          }
          if (outcome === 'rejected') {
            options?.onWriteRejected?.()
            markSubmitted()
            return
          }
          if (outcome === 'unknown') {
            // A lost acknowledgment is not a refusal; the screen check below
            // still only acts on text it can see parked.
            options?.onWriteUnconfirmed?.()
          }
          confirmNativeChatSubmit({
            text,
            readScreen: options?.readScreen,
            delay,
            resendEnter: () => {
              sendRuntimePtyInput(settings, ptyId, NATIVE_CHAT_SUBMIT, 'driving')
            },
            done: markSubmitted
          })
        })
      })
    },
    { onCancelUnsubmitted: () => clearUnsubmittedAgentInput(settings, ptyId, options) }
  )
}
