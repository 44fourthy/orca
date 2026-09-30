import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendRuntimePtyInput = vi.fn()
const sendRemoteNativeChatPrompt = vi.fn()
const remoteNativeChatSendTarget = vi.fn()
const readRemoteNativeChatScreen = vi.fn()
vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  sendRuntimePtyInput: (...args: unknown[]) => sendRuntimePtyInput(...args),
  sendRuntimePtyInputVerified: vi.fn()
}))
vi.mock('./native-chat-remote-send', () => ({
  remoteNativeChatSendTarget: (...args: unknown[]) => remoteNativeChatSendTarget(...args),
  sendRemoteNativeChatPrompt: (...args: unknown[]) => sendRemoteNativeChatPrompt(...args),
  readRemoteNativeChatScreen: (...args: unknown[]) => readRemoteNativeChatScreen(...args)
}))

import {
  resetNativeChatPtySendQueuesForTests,
  sendNativeChatMessage
} from './native-chat-runtime-send'
import { NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT } from './native-chat-input-clear'
import { buildNativeChatPasteBytes, NATIVE_CHAT_SUBMIT } from './native-chat-send'
import { NATIVE_CHAT_SUBMIT_CHECK_MS } from './native-chat-submit-confirm'

const SETTINGS: Parameters<typeof sendNativeChatMessage>[0] = { activeRuntimeEnvironmentId: null }
const PTY = 'remote-pty'
const TARGET = { environmentId: 'env-colors', terminal: 'term_a' }
const RULE = '─'.repeat(20)
const PARKED = [RULE, '❯ fix the drawer', RULE].join('\n')
const EMPTY = [RULE, '❯ ', RULE].join('\n')

function writes(): unknown[] {
  return sendRuntimePtyInput.mock.calls.map((call) => call[2])
}

describe('sendNativeChatMessage on a Remote Orca Server pane', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    resetNativeChatPtySendQueuesForTests()
    sendRuntimePtyInput.mockReturnValue(true)
    remoteNativeChatSendTarget.mockReturnValue(TARGET)
    sendRemoteNativeChatPrompt.mockResolvedValue('accepted')
    readRemoteNativeChatScreen.mockResolvedValue(EMPTY)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears, then hands body + Enter to the host in one call', async () => {
    const onWriteRejected = vi.fn()
    const handle = sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer', { onWriteRejected })
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 4)
    expect(writes()).toEqual([NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT])
    expect(sendRemoteNativeChatPrompt).toHaveBeenCalledExactlyOnceWith(
      TARGET,
      buildNativeChatPasteBytes('fix the drawer')
    )
    expect(onWriteRejected).not.toHaveBeenCalled()
    await expect(handle.settled).resolves.toBeUndefined()
  })

  it('reports a host refusal and sends no Enter of its own', async () => {
    sendRemoteNativeChatPrompt.mockResolvedValue('rejected')
    const onWriteRejected = vi.fn()
    readRemoteNativeChatScreen.mockResolvedValue(PARKED)
    sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer', { onWriteRejected })
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 4)
    expect(onWriteRejected).toHaveBeenCalledOnce()
    expect(writes()).toEqual([NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT])
  })

  it("re-sends Enter while the host's screen shows our text parked, then stops", async () => {
    readRemoteNativeChatScreen.mockResolvedValueOnce(PARKED).mockResolvedValue(EMPTY)
    sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer')
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 4)
    expect(writes()).toEqual([NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT, NATIVE_CHAT_SUBMIT])
  })

  it('never re-sends Enter when the screen does not show our text', async () => {
    sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer')
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 4)
    expect(writes()).toEqual([NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT])
  })

  it('flags an unconfirmed host call but still only re-sends on visible text', async () => {
    sendRemoteNativeChatPrompt.mockResolvedValue('unknown')
    const onWriteUnconfirmed = vi.fn()
    sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer', { onWriteUnconfirmed })
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 4)
    expect(onWriteUnconfirmed).toHaveBeenCalledOnce()
    expect(writes()).toEqual([NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT])
  })

  it('reads the screen from the host, not the local terminal copy', async () => {
    sendNativeChatMessage(SETTINGS, PTY, 'ok ship it')
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 2)
    expect(readRemoteNativeChatScreen).toHaveBeenCalledWith(TARGET)
  })

  it('gives up after three re-sent Enters when the text never leaves', async () => {
    readRemoteNativeChatScreen.mockResolvedValue([RULE, '❯ ok ship it', RULE].join('\n'))
    sendNativeChatMessage(SETTINGS, PTY, 'ok ship it')
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 8)
    expect(writes()).toEqual([
      NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT,
      NATIVE_CHAT_SUBMIT,
      NATIVE_CHAT_SUBMIT,
      NATIVE_CHAT_SUBMIT
    ])
  })

  it('treats an unreadable host screen as unconfirmed and never re-sends', async () => {
    readRemoteNativeChatScreen.mockResolvedValue(null)
    sendNativeChatMessage(SETTINGS, PTY, 'ok ship it')
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 8)
    expect(writes()).toEqual([NATIVE_CHAT_CLEAR_UNSUBMITTED_INPUT])
  })

  it('keeps the local two-write path for a pane with no runtime terminal', async () => {
    remoteNativeChatSendTarget.mockReturnValue(null)
    sendNativeChatMessage(SETTINGS, PTY, 'fix the drawer')
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_SUBMIT_CHECK_MS * 4)
    expect(sendRemoteNativeChatPrompt).not.toHaveBeenCalled()
    expect(writes()).toContain(NATIVE_CHAT_SUBMIT)
  })
})
