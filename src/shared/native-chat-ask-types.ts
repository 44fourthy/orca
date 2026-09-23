// Canonical AskUserQuestion prompt types consumed by the shared parser and both
// native-chat platform UIs.

export type AskOption = {
  label: string
  description?: string
  /** Optional per-option preview (Claude Code renders it beside the option list).
   *  Its mere presence switches Claude's selector to a layout where Enter, not
   *  the bare option digit, is what commits a pick — see buildAskAnswerKeys. */
  preview?: string
}
export type AskQuestion = {
  question: string
  header?: string
  multiSelect: boolean
  options: AskOption[]
}
export type AskPrompt = { questions: AskQuestion[] }

/** A parser turns one agent's interactive-question tool input into the normalized
 *  AskPrompt the card renders. */
export type InteractiveQuestionParser = (input: unknown) => AskPrompt | null
