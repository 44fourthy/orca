import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  getActiveRuntimeTarget: vi.fn(),
  getRemoteRuntimeTerminalHandle: vi.fn(),
  getRemoteRuntimePtyEnvironmentId: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc,
  getActiveRuntimeTarget: mocks.getActiveRuntimeTarget
}))
vi.mock('@/runtime/runtime-terminal-stream', () => ({
  getRemoteRuntimeTerminalHandle: mocks.getRemoteRuntimeTerminalHandle,
  getRemoteRuntimePtyEnvironmentId: mocks.getRemoteRuntimePtyEnvironmentId
}))

import { remoteNativeChatSendTarget, sendRemoteNativeChatPrompt } from './native-chat-remote-send'

describe('remoteNativeChatSendTarget', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('is null for a local pane', () => {
    mocks.getRemoteRuntimeTerminalHandle.mockReturnValue(null)
    expect(remoteNativeChatSendTarget({ activeRuntimeEnvironmentId: null }, 'pty-1')).toBeNull()
  })

  it("uses the pane's owning environment", () => {
    mocks.getRemoteRuntimeTerminalHandle.mockReturnValue('term_a')
    mocks.getRemoteRuntimePtyEnvironmentId.mockReturnValue('env-bara')
    expect(remoteNativeChatSendTarget({ activeRuntimeEnvironmentId: 'other' }, 'p')).toEqual({
      environmentId: 'env-bara',
      terminal: 'term_a'
    })
  })

  it('falls back to the active server when the pane names no owner', () => {
    mocks.getRemoteRuntimeTerminalHandle.mockReturnValue('term_a')
    mocks.getRemoteRuntimePtyEnvironmentId.mockReturnValue(null)
    mocks.getActiveRuntimeTarget.mockReturnValue({ kind: 'environment', environmentId: 'env-x' })
    expect(remoteNativeChatSendTarget({ activeRuntimeEnvironmentId: 'env-x' }, 'p')).toEqual({
      environmentId: 'env-x',
      terminal: 'term_a'
    })
  })
})

describe('sendRemoteNativeChatPrompt', () => {
  const target = { environmentId: 'env-bara', terminal: 'term_a' }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sends body and Enter in ONE terminal.send, as Orca Mobile does', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ send: { accepted: true } })
    await expect(sendRemoteNativeChatPrompt(target, 'fix the drawer')).resolves.toBe('accepted')
    expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(1)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-bara' },
      'terminal.send',
      {
        terminal: 'term_a',
        text: 'fix the drawer',
        enter: true,
        client: { id: 'orca-desktop', type: 'desktop' }
      },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })

  it('reports a refusal as rejected', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ send: { accepted: false } })
    await expect(sendRemoteNativeChatPrompt(target, 'x')).resolves.toBe('rejected')
  })

  it('reports a failed call as unknown, never as a definite failure', async () => {
    mocks.callRuntimeRpc.mockRejectedValue(new Error('socket closed'))
    await expect(sendRemoteNativeChatPrompt(target, 'x')).resolves.toBe('unknown')
  })
})
