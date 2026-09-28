import { createContext, useContext } from 'react'

/** Which queued bubbles the agent is holding in its own queue, and how to flush it. */
export type NativeChatAgentQueue = {
  queuedIds: ReadonlySet<string>
  sendNow: () => void
}

const EMPTY: NativeChatAgentQueue = { queuedIds: new Set(), sendNow: () => {} }

export const NativeChatAgentQueueContext = createContext<NativeChatAgentQueue>(EMPTY)

export function useNativeChatAgentQueue(): NativeChatAgentQueue {
  return useContext(NativeChatAgentQueueContext)
}
