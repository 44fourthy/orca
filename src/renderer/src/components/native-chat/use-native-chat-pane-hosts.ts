import { useAppStore } from '@/store'
import {
  selectNativeChatRuntimeEnvironmentId,
  selectNativeChatSshExecutionHostId
} from './native-chat-runtime-owner'

/** Where a Native Chat pane's session runs: a runtime owner (Model B) and/or a user SSH host. */
export function useNativeChatPaneHosts(terminalTabId: string): {
  runtimeEnvironmentId: string | null
  executionHostId: string | null
} {
  const runtimeEnvironmentId = useAppStore((s) =>
    selectNativeChatRuntimeEnvironmentId(s, terminalTabId)
  )
  const executionHostId = useAppStore((s) => selectNativeChatSshExecutionHostId(s, terminalTabId))
  return { runtimeEnvironmentId, executionHostId }
}
