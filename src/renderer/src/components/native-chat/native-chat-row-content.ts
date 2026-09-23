// One derivation of a message's renderable parts, shared by the row that draws it
// and the list that decides whether it occupies a transcript slot. Windowing makes
// that agreement load-bearing: a row the list counts but the row component declines
// to draw would reserve estimated height for nothing.
//
// Cached on the block array itself, so a streaming turn re-deriving on every frame
// pays once per revision rather than once per consumer.

import {
  backgroundTaskBlocks,
  claimBackgroundTaskTwins
} from '../../../../shared/native-chat-background-task-row'
import {
  isSubagentGroupFallbackText,
  subagentGroupBlocks
} from '../../../../shared/native-chat-subagent-summary'
import {
  isBackgroundTaskBlock,
  isSubagentGroupBlock,
  type NativeChatBlock
} from '../../../../shared/native-chat-types'
import { splitNativeChatBlocks } from './native-chat-tool-fold'
import { nativeChatProseToMarkdown } from './native-chat-prose'

/** Inferred from `derive` so the shape cannot drift from what it returns. */
export type NativeChatRowContent = ReturnType<typeof derive>

const derivations = new WeakMap<object, { visible?: NativeChatRowContent; hidden?: NativeChatRowContent }>()

function derive(blocks: readonly NativeChatBlock[], hideToolActivity: boolean) {
  const split = splitNativeChatBlocks(blocks)
  const groups = subagentGroupBlocks(split.prose)
  const tasks = backgroundTaskBlocks(split.prose)
  // Both row kinds carry a plain-text twin so a client without the block type
  // still reads them. This draws the blocks, so only the twins are dropped —
  // never real text beside them, which a lane folding a roster into a message
  // keeps. A task row's twin is claimed by exact text, because its sentence is
  // often the provider's own and has no shape to match.
  //
  // Why hideToolActivity strips them too: the twins and the childless-roster
  // fallback exist only to stand in for activity rows this client will not
  // draw — with activity hidden they are the noise, not the record.
  const taskTwins = claimBackgroundTaskTwins(split.prose)
  const stripActivity = hideToolActivity || groups.length > 0 || tasks.length > 0
  const prose = !stripActivity
    ? split.prose
    : split.prose.filter(
        (block, index) =>
          !isSubagentGroupBlock(block) &&
          !isBackgroundTaskBlock(block) &&
          !taskTwins.twinTextIndexes.has(index) &&
          !(
            (hideToolActivity || groups.length > 0) &&
            block.type === 'text' &&
            isSubagentGroupFallbackText(block.text)
          )
      )
  return {
    prose,
    tools: hideToolActivity ? [] : split.tools,
    subagentGroups: hideToolActivity ? [] : groups,
    backgroundTasks: hideToolActivity ? [] : tasks,
    markdown: nativeChatProseToMarkdown(prose),
    hasImages: prose.some((block) => block.type === 'image-ref')
  }
}

export type NativeChatRowContentOptions = {
  /** Keeps tool calls, rosters and task rows out of the transcript (fork
   *  default). One flag, because the row, the rail and the slot builder must
   *  agree on whether a row draws anything. */
  hideToolActivity?: boolean
}

export function deriveNativeChatRowContent(
  blocks: readonly NativeChatBlock[],
  options?: NativeChatRowContentOptions
): NativeChatRowContent {
  const hidden = options?.hideToolActivity === true
  const cachedEntry = derivations.get(blocks)
  const cached = hidden ? cachedEntry?.hidden : cachedEntry?.visible
  if (cached) {
    return cached
  }
  const content = derive(blocks, hidden)
  derivations.set(blocks, { ...cachedEntry, [hidden ? 'hidden' : 'visible']: content })
  return content
}

/** Whether the row draws anything. An empty row takes no slot in the transcript. */
export function nativeChatRowRendersContent(
  blocks: readonly NativeChatBlock[],
  options?: NativeChatRowContentOptions
): boolean {
  const { markdown, hasImages, tools, subagentGroups, backgroundTasks } =
    deriveNativeChatRowContent(blocks, options)
  return (
    markdown.length > 0 ||
    hasImages ||
    tools.length > 0 ||
    subagentGroups.length > 0 ||
    backgroundTasks.length > 0
  )
}
