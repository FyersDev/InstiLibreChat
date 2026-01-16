import { Suspense, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { DelayedRender } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TAttachment,
  SearchResultData,
  TMessageContentParts,
} from 'librechat-data-provider';
import { UnfinishedMessage } from './MessageContent';
import Sources from '~/components/Web/Sources';
import { cn, mapAttachments } from '~/utils';
import { SearchContext } from '~/Providers';
import MarkdownLite from './MarkdownLite';
import store from '~/store';
import Part from './Part';

const SearchContent = ({
  message,
  attachments,
  searchResults,
}: {
  message: TMessage;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
}) => {
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const { messageId } = message;

  const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);

  if (Array.isArray(message.content) && message.content.length > 0) {
    return (
      <SearchContext.Provider value={{ searchResults }}>
        <Sources />
        {message.content
          .filter((part: TMessageContentParts | undefined) => part)
          .map((part: TMessageContentParts | undefined, idx: number) => {
            if (!part) {
              return null;
            }

            const toolCallId =
              (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
            const attachments = attachmentMap[toolCallId];
            return (
              <Part
                key={`display-${messageId}-${idx}`}
                showCursor={false}
                isSubmitting={false}
                isCreatedByUser={message.isCreatedByUser}
                attachments={attachments}
                part={part}
              />
            );
          })}
        {message.unfinished === true && (
          <Suspense>
            <DelayedRender delay={250}>
              <UnfinishedMessage message={message} key={`unfinished-${messageId}`} />
            </DelayedRender>
          </Suspense>
        )}
      </SearchContext.Provider>
    );
  }

  // Extract user query from JSON if present (for user messages in search results)
  const displayText = useMemo(() => {
    const text = message.text || '';
    
    // Only process user messages that start with JSON
    if (message.isCreatedByUser && text.trim().startsWith('{')) {
      try {
        const requestObject = JSON.parse(text);
        
        // If this has a query field, extract and return only the query
        if (requestObject.query !== undefined && requestObject.query !== null) {
          return requestObject.query;
        }
      } catch (e) {
        // If JSON parsing fails, return original text
      }
    }
    
    return text;
  }, [message.text, message.isCreatedByUser]);

  return (
    <div
      className={cn(
        'markdown prose dark:prose-invert light w-full break-words',
        message.isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        message.isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-70',
      )}
      style={{
        textAlign: message.isCreatedByUser ? 'right' : 'left',
        display: 'flex',
        justifyContent: message.isCreatedByUser ? 'flex-end' : 'flex-start',
      }}
      dir="auto"
    >
      <MarkdownLite content={displayText} />
    </div>
  );
};

export default SearchContent;
