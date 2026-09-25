import { translate } from '@/i18n/i18n'

export function NativeChatTypingIndicatorRow(): React.JSX.Element {
  return (
    <div
      className="flex h-8 items-center justify-start"
      aria-label={translate('components.native-chat.status.responding', 'Agent is responding')}
      aria-live="polite"
    >
      <span className="animate-pulse text-xs italic text-muted-foreground">
        {translate('components.native-chat.status.working', 'Working…')}
      </span>
    </div>
  )
}
