import { describe, expect, it, vi } from 'vitest'
import {
  composerStillHoldsSend,
  confirmNativeChatSubmit,
  NATIVE_CHAT_SUBMIT_CHECK_MS,
  NATIVE_CHAT_SUBMIT_RETRIES
} from './native-chat-submit-confirm'

const RULE = '─'.repeat(40)

function claudeScreen(promptLine: string): string {
  return ['● Done — the build is green.', '', RULE, `❯ ${promptLine}`, RULE, '  ? for shortcuts'].join(
    '\n'
  )
}

describe('composerStillHoldsSend', () => {
  it('sees our text parked on the prompt line', () => {
    expect(composerStillHoldsSend(claudeScreen('fix the drawer'), 'fix the drawer')).toBe(true)
  })

  it('matches a long first line cut short by wrapping', () => {
    const text = 'please look at the annotation environment and tell me why it keeps timing out'
    expect(composerStillHoldsSend(claudeScreen(text.slice(0, 40)), text)).toBe(true)
  })

  it("matches Claude's collapsed paste placeholder", () => {
    expect(composerStillHoldsSend(claudeScreen('[Pasted text #1 +12 lines]'), 'a\nb')).toBe(true)
  })

  it('treats an empty prompt line as submitted', () => {
    expect(composerStillHoldsSend(claudeScreen(''), 'fix the drawer')).toBe(false)
  })

  it('leaves other text alone — the user may be typing in the TUI', () => {
    expect(composerStillHoldsSend(claudeScreen('something else'), 'fix the drawer')).toBe(false)
  })

  it('never confirms from an unreadable screen or a dialog without a prompt line', () => {
    expect(composerStillHoldsSend(null, 'fix the drawer')).toBe(false)
    expect(
      composerStillHoldsSend('Do you want to proceed?\n  1. Yes\n  2. No', 'fix the drawer')
    ).toBe(false)
  })

  it('ignores a probe too short to tell apart', () => {
    expect(composerStillHoldsSend(claudeScreen('ok'), 'ok')).toBe(false)
  })
})

describe('confirmNativeChatSubmit', () => {
  function run(screens: (string | null)[], readScreen = true) {
    vi.useFakeTimers()
    const resendEnter = vi.fn()
    const done = vi.fn()
    let read = 0
    confirmNativeChatSubmit({
      text: 'fix the drawer',
      readScreen: readScreen ? () => screens[Math.min(read++, screens.length - 1)] : undefined,
      delay: (ms, fn) => {
        setTimeout(fn, ms)
      },
      resendEnter,
      done
    })
    return { resendEnter, done }
  }

  it('finishes immediately when there is no screen to check', () => {
    const { resendEnter, done } = run([], false)
    expect(done).toHaveBeenCalledTimes(1)
    expect(resendEnter).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does nothing extra when the Enter took', () => {
    const { resendEnter, done } = run([claudeScreen('')])
    vi.advanceTimersByTime(NATIVE_CHAT_SUBMIT_CHECK_MS)
    expect(resendEnter).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('re-sends Enter for a parked send, then finishes once it clears', () => {
    const { resendEnter, done } = run([claudeScreen('fix the drawer'), claudeScreen('')])
    vi.advanceTimersByTime(NATIVE_CHAT_SUBMIT_CHECK_MS)
    expect(resendEnter).toHaveBeenCalledTimes(1)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(NATIVE_CHAT_SUBMIT_CHECK_MS)
    expect(resendEnter).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('gives up after the retry budget', () => {
    const { resendEnter, done } = run([claudeScreen('fix the drawer')])
    vi.advanceTimersByTime(NATIVE_CHAT_SUBMIT_CHECK_MS * (NATIVE_CHAT_SUBMIT_RETRIES + 2))
    expect(resendEnter).toHaveBeenCalledTimes(NATIVE_CHAT_SUBMIT_RETRIES)
    expect(done).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
