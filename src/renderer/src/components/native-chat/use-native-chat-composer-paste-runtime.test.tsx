// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { NativeChatAttachmentOwner } from './native-chat-attachment-upload'

const mocks = vi.hoisted(() => ({
  saveClipboardImageAsTempFile: vi.fn(),
  readClipboardText: vi.fn(),
  readClipboardImageThumbnail: vi.fn(),
  clipboardHasImage: vi.fn(),
  readClipboardFilePaths: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('./native-chat-composer-target', () => ({
  NATIVE_CHAT_CONTEXT_PASTE_MAX_BYTES: 1024
}))

vi.mock('./native-chat-attachment-upload', () => ({
  nativeChatWorktreeNotReadyNotice: () => 'Worktree not ready — try again in a moment.'
}))

vi.stubGlobal('window', { api: { ui: mocks } })
vi.stubGlobal('URL', {
  createObjectURL: () => 'blob:clipboard-image',
  revokeObjectURL: () => {}
})

import { useNativeChatComposerPaste } from './use-native-chat-composer-paste'

const runtimeOwner: NativeChatAttachmentOwner = {
  kind: 'runtime',
  environmentId: 'env-1',
  worktreeId: 'wt-1',
  worktreePath: '/remote/wt'
}

function imagePasteEvent(): ClipboardEvent {
  const data = new DataTransfer()
  data.items.add(new File(['image'], 'image.png', { type: 'image/png' }))
  return new ClipboardEvent('paste', { clipboardData: data, cancelable: true })
}

function renderPaste() {
  const spies = {
    attachResolvedPaths: vi.fn(),
    beginPendingImageAttachment: vi.fn((): string | null => 'chip-1'),
    resolvePendingImageAttachment: vi.fn(),
    dropPendingImageAttachment: vi.fn(),
    setNotice: vi.fn()
  }
  const hook = renderHook(() =>
    useNativeChatComposerPaste({
      targetKey: 'session-1',
      agent: 'claude',
      disabled: false,
      caret: 0,
      setCaret: () => {},
      insertTypedText: () => true,
      resolveAttachmentOwner: () => runtimeOwner,
      ...spies
    })
  )
  return { ...spies, latest: () => hook.result.current }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.readClipboardText.mockResolvedValue('')
  mocks.readClipboardImageThumbnail.mockResolvedValue(null)
  mocks.clipboardHasImage.mockResolvedValue(false)
  mocks.readClipboardFilePaths.mockResolvedValue([])
  mocks.saveClipboardImageAsTempFile.mockResolvedValue(null)
})

describe('clipboard image paste on a Remote Orca Server pane', () => {
  it('saves on the runtime host and settles the chip on the returned runtime path', async () => {
    mocks.saveClipboardImageAsTempFile.mockResolvedValue('/tmp/orca-paste-1.png')
    const probe = renderPaste()

    await act(async () => probe.latest().handlePaste(imagePasteEvent()))

    // #16839: the runtime's own clipboard importer writes the temp file on the
    // server — a client-local path would name a file the agent cannot read.
    expect(mocks.saveClipboardImageAsTempFile).toHaveBeenCalledWith({
      runtimeEnvironmentId: 'env-1'
    })
    expect(probe.beginPendingImageAttachment).toHaveBeenCalledWith('blob:clipboard-image', {
      targetOwned: true
    })
    expect(probe.resolvePendingImageAttachment).toHaveBeenCalledWith(
      'chip-1',
      '/tmp/orca-paste-1.png',
      null
    )
  })

  it('surfaces a failed runtime image save through the composer notice', async () => {
    mocks.saveClipboardImageAsTempFile.mockRejectedValue(new Error('runtime upload failed'))
    const probe = renderPaste()

    await act(async () => probe.latest().handlePaste(imagePasteEvent()))

    expect(probe.setNotice).toHaveBeenCalledWith('runtime upload failed')
    expect(probe.dropPendingImageAttachment).toHaveBeenCalledWith('chip-1')
  })

  it('marks a no-placeholder runtime attach as target-owned', async () => {
    mocks.saveClipboardImageAsTempFile.mockResolvedValue('/tmp/orca-paste-2.png')
    const probe = renderPaste()

    await act(async () => probe.latest().pasteFromClipboard())

    // The saved path lives on the runtime host, so the remote-target gate has to
    // see it as owned — with a live re-check for an owner that moved mid-paste.
    expect(probe.attachResolvedPaths).toHaveBeenCalledWith(['/tmp/orca-paste-2.png'], null, {
      targetOwnerIsCurrent: expect.any(Function)
    })
  })
})
