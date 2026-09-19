import { useEffect, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import {
  nativeChatRepoListRead,
  type MobileRuntimeRepoSummary
} from './mobile-session-read-operations'
import { isFloatingWorkspaceWorktreeId } from './floating-workspace'
import {
  isMobileNativeChatTranscriptReadable,
  mobileNativeChatExecutionHostId
} from './mobile-native-chat-eligibility'
import { getRepoIdFromMobileWorktreeId } from './mobile-session-route-helpers'

type ReadabilityState = {
  client: RpcClient | null
  worktreeId: string
  readable: boolean
  executionHostId: string | null
}

export function useMobileNativeChatReadability(
  client: RpcClient | null,
  worktreeId: string
): boolean {
  return useMobileNativeChatHost(client, worktreeId).readable
}

/** Readability plus the `ssh:` host the paired host must read from, from one repo lookup. */
export function useMobileNativeChatHost(
  client: RpcClient | null,
  worktreeId: string
): { readable: boolean; executionHostId: string | null } {
  const isFloatingWorkspace = isFloatingWorkspaceWorktreeId(worktreeId)
  const [state, setState] = useState<ReadabilityState>({
    client: null,
    worktreeId: '',
    readable: false,
    executionHostId: null
  })
  useEffect(() => {
    // Why: the floating workspace always runs on the paired host and has no repo connection to resolve.
    if (isFloatingWorkspace) {
      return
    }
    let active = true
    if (!client) {
      setState({ client, worktreeId, readable: false, executionHostId: null })
      return
    }
    void nativeChatRepoListRead
      .request(client)
      .then((response) => {
        if (!active) {
          return
        }
        const accepted = nativeChatRepoListRead.interpret(response)
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Preserve the established response shape at this boundary.
        const repos = accepted.accepted
          ? ((accepted.value as MobileRuntimeRepoSummary[]) ?? [])
          : []
        const repoId = getRepoIdFromMobileWorktreeId(worktreeId)
        const repo = repos.find((candidate) => candidate.id === repoId)
        setState({
          client,
          worktreeId,
          readable: repo ? isMobileNativeChatTranscriptReadable(repo.connectionId ?? null) : false,
          executionHostId: repo ? mobileNativeChatExecutionHostId(repo.connectionId ?? null) : null
        })
      })
      .catch(() => {
        if (active) {
          setState({ client, worktreeId, readable: false, executionHostId: null })
        }
      })
    return () => {
      active = false
    }
  }, [client, isFloatingWorkspace, worktreeId])
  if (isFloatingWorkspace) {
    return { readable: true, executionHostId: null }
  }
  // Why: route reuse renders before its new effect resolves; never expose the
  // previous repo's readability under a different client/worktree key.
  return state.client === client && state.worktreeId === worktreeId
    ? { readable: state.readable, executionHostId: state.executionHostId }
    : { readable: false, executionHostId: null }
}
