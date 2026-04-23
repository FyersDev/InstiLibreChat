import { QueryKeys, Constants } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipAnchor, Button, NewChatIcon } from '@librechat/client';
import { useChatContext } from '~/Providers';
import { clearMessagesCache } from '~/utils';
import { useLocalize } from '~/hooks';

export default function HeaderNewChat() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { conversation, newConversation } = useChatContext();

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    // Clear all selections when starting a new chat
    localStorage.removeItem(`persona_data_${Constants.NEW_CONVO}`);
    localStorage.removeItem(`template_data_${Constants.NEW_CONVO}`);
    localStorage.removeItem(`persona_documents_${Constants.NEW_CONVO}`);
    
    // Dispatch events to notify all components
    window.dispatchEvent(new Event('personaUpdated'));
    window.dispatchEvent(new Event('templateUpdated'));
    window.dispatchEvent(new Event('documentsUpdated'));
    
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_new_chat')}
      render={
        <Button
          size="icon"
          variant="ghost"
          data-testid="wide-header-new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="h-[35px] w-[35px] max-md:hidden rounded-none border-none bg-transparent p-2 hover:bg-transparent"
          onClick={clickHandler}
        >
          <NewChatIcon />
        </Button>
      }
    />
  );
}
