import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendRuntimePtyInput = vi.fn()
const sendRemoteNativeChatPrompt = vi.fn()
const remoteNativeChatSendTarget = vi.fn()
vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  sendRuntimePtyInput: (...args: unknown[]) => sendRuntimePtyInput(...args),
  sendRuntimePtyInputVerified: vi.fn()
}))
vi.mock('./native-chat-remote-send', () => ({
  remoteNativeChatSendTarget: (...args: unknown[]) => remoteNativeChatSendTarget(...args),
  sendRemoteNativeChatPrompt: (...args: unknown[]) => sendRemoteNativeChatPrompt(...args)
}))

import {
  resetNativeChatPtySendQueuesForTests,
  sendNativeChatMessage,
  NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT,
  NATIVE_CHAT_SUBMIT_DELAY_MS
} from './native-chat-runtime-send'
import { buildNativeChatPasteBytes, NATIVE_CHAT_SUBMIT } from './native-chat-send'
import { NATIVE_CHAT_SUBMIT_CHECK_MS } from './native-chat-submit-confirm'

const SETTINGS: Parameters<typeof sendNativeChatMessage>[0] = { activeRuntimeEnvironmentId: null }
const PTY = 'remote-pty'
const TARGET = { environmentId: 'env-bara', terminal: 'term_a' }

describe('sendNativeChatMessage on a Remote Orca Server pane', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    resetNativeChatPtySendQueuesForTests()
    sendRuntimePtyInput.mockReturnValue(true)
    remoteNativeChatSendTarget.mockReturnValue(TARGET)
    sendRemoteNativeChatPrompt.mockResolvedValue('accepted')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears, then hands body + Enter to the host in one call — no client-timed Enter', async () => {
    const handle = sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer')
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_DELAY_MS * 4)
    expect(sendRuntimePtyInput.mock.calls.map((call) => call[2])).toEqual([
      NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT
    ])
    expect(sendRemoteNativeChatPrompt).toHaveBeenCalledTimes(1)
    expect(sendRemoteNativeChatPrompt).toHaveBeenCalledWith(
      TARGET,
      buildNativeChatPasteBytes('fix the drawer')
    )
    await expect(handle.settled).resolves.toBeUndefined()
  })

  it('still re-sends Enter when the text is visibly parked afterwards', async () => {
    const parked = ['─'.repeat(20), '❯ fix the drawer', '─'.repeat(20)].join('\n')
    const cleared = ['─'.repeat(20), '❯ ', '─'.repeat(20)].join('\n')
    const screens = [parked, cleared]
    let read = 0
    sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer', {
      readScreen: () => screens[Math.min(read++, screens.length - 1)]
    })
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 3)
    expect(sendRuntimePtyInput.mock.calls.map((call) => call[2])).toEqual([
      NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT,
      NATIVE_CHAT_SUBMIT
    ])
  })
})
