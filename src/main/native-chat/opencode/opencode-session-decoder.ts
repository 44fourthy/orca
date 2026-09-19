import type {
  NativeChatBlock,
  NativeChatMessage,
  NativeChatTurnLifecycle
} from '../../../shared/native-chat-types'
import type {
  OpenCodeMessageRow,
  OpenCodePartRow,
  OpenCodeSessionWindow
} from '../../../shared/opencode-session-window'

export type DecodedOpenCodeSession = {
  messages: NativeChatMessage[]
  lifecycle?: NativeChatTurnLifecycle
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(text))
  } catch {
    return null
  }
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function timeOf(record: Record<string, unknown> | null, fallback: number): number {
  const time = asRecord(record?.time)
  const created = time?.created
  return typeof created === 'number' ? created : fallback
}

function outputText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value === undefined || value === null) {
    return ''
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** OpenCode records the whole tool lifecycle on one part; native chat wants a call, then a result. */
function decodeToolPart(
  part: OpenCodePartRow,
  data: Record<string, unknown>,
  timestamp: number
): NativeChatMessage[] {
  const state = asRecord(data.state)
  const status = asText(state?.status)
  const callId = asText(data.callID) ?? undefined
  const name = asText(data.tool) ?? 'tool'
  const callState: 'running' | 'completed' | 'failed' | undefined =
    status === 'completed'
      ? 'completed'
      : status === 'error'
        ? 'failed'
        : status === 'running' || status === 'pending'
          ? 'running'
          : undefined
  const call: NativeChatMessage = {
    id: part.id,
    role: 'assistant',
    blocks: [
      {
        type: 'tool-call',
        name,
        input: state?.input ?? null,
        ...(callId ? { callId } : {}),
        ...(callState ? { state: callState } : {})
      }
    ],
    timestamp,
    source: 'transcript'
  }
  if (status !== 'completed' && status !== 'error') {
    return [call]
  }
  const isError = status === 'error'
  const result: NativeChatMessage = {
    id: `${part.id}:result`,
    role: 'tool',
    blocks: [
      {
        type: 'tool-result',
        output: outputText(isError ? (state?.error ?? state?.output) : state?.output),
        ...(isError ? { isError: true } : {})
      }
    ],
    timestamp: (() => {
      const time = asRecord(state?.time)
      return typeof time?.end === 'number' ? time.end : timestamp
    })(),
    source: 'transcript'
  }
  return [call, result]
}

function decodeUserMessage(
  message: OpenCodeMessageRow,
  parts: OpenCodePartRow[],
  timestamp: number
): NativeChatMessage | null {
  const blocks: NativeChatBlock[] = []
  for (const part of parts) {
    const data = parseJson(part.data)
    if (!data) {
      continue
    }
    if (data.type === 'text') {
      const text = asText(data.text)
      if (text) {
        blocks.push({ type: 'text', text })
      }
    } else if (data.type === 'file') {
      const mime = asText(data.mime) ?? ''
      const url = asText(data.url)
      const filename = asText(data.filename)
      if (url && mime.startsWith('image/')) {
        blocks.push({ type: 'image-ref', url, ...(filename ? { alt: filename } : {}) })
      } else if (filename) {
        blocks.push({ type: 'text', text: `[attachment: ${filename}]` })
      }
    }
  }
  if (blocks.length === 0) {
    return null
  }
  return { id: message.id, role: 'user', blocks, timestamp, source: 'transcript' }
}

function decodeAssistantMessage(parts: OpenCodePartRow[], timestamp: number): NativeChatMessage[] {
  const out: NativeChatMessage[] = []
  for (const part of parts) {
    const data = parseJson(part.data)
    if (!data) {
      continue
    }
    const partTime = timeOf(data, part.timeCreated || timestamp)
    if (data.type === 'text') {
      const text = asText(data.text)
      if (text) {
        out.push({
          id: part.id,
          role: 'assistant',
          blocks: [{ type: 'text', text }],
          timestamp: partTime,
          source: 'transcript'
        })
      }
    } else if (data.type === 'reasoning') {
      const text = asText(data.text)
      if (text) {
        out.push({
          id: part.id,
          role: 'reasoning',
          blocks: [{ type: 'text', text }],
          timestamp: partTime,
          source: 'transcript'
        })
      }
    } else if (data.type === 'tool') {
      out.push(...decodeToolPart(part, data, partTime))
    }
    // step-start / step-finish / patch / snapshot carry no prose; the lifecycle
    // below reads the message row instead.
  }
  return out
}

/** Settled when the newest assistant turn finished; otherwise the agent is still working. */
function decodeLifecycle(
  messages: OpenCodeMessageRow[],
  decoded: Map<string, Record<string, unknown> | null>
): NativeChatTurnLifecycle | undefined {
  const last = messages.at(-1)
  if (!last) {
    return undefined
  }
  const data = decoded.get(last.id) ?? null
  const role = asText(data?.role)
  if (role === 'user') {
    return { state: 'working', turnId: last.id, timestamp: timeOf(data, last.timeCreated) }
  }
  if (role !== 'assistant') {
    return undefined
  }
  const time = asRecord(data?.time)
  const completed = typeof time?.completed === 'number' ? time.completed : null
  const error = asRecord(data?.error)
  if (error) {
    return { state: 'interrupted', turnId: last.id, timestamp: completed ?? last.timeUpdated }
  }
  if (completed !== null || asText(data?.finish)) {
    return { state: 'completed', turnId: last.id, timestamp: completed ?? last.timeUpdated }
  }
  return { state: 'working', turnId: last.id, timestamp: timeOf(data, last.timeCreated) }
}

export function decodeOpenCodeSessionWindow(window: OpenCodeSessionWindow): DecodedOpenCodeSession {
  const partsByMessage = new Map<string, OpenCodePartRow[]>()
  for (const part of window.parts) {
    const list = partsByMessage.get(part.messageId)
    if (list) {
      list.push(part)
    } else {
      partsByMessage.set(part.messageId, [part])
    }
  }
  const decodedRows = new Map<string, Record<string, unknown> | null>()
  const messages: NativeChatMessage[] = []
  for (const message of window.messages) {
    const data = parseJson(message.data)
    decodedRows.set(message.id, data)
    const parts = partsByMessage.get(message.id) ?? []
    const timestamp = timeOf(data, message.timeCreated)
    const role = asText(data?.role)
    if (role === 'user') {
      const decoded = decodeUserMessage(message, parts, timestamp)
      if (decoded) {
        messages.push(decoded)
      }
    } else if (role === 'assistant') {
      messages.push(...decodeAssistantMessage(parts, timestamp))
    }
  }
  return { messages, lifecycle: decodeLifecycle(window.messages, decodedRows) }
}
