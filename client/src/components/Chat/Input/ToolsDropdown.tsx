import React, { useState, useCallback } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { Constants } from 'librechat-data-provider';
import { cn } from '~/utils';
import DocumentSelector from '~/components/Documents/DocumentSelector';
import type { DocumentListItem } from '~/data-provider/document-service';

interface ToolsDropdownProps {
  disabled?: boolean;
}

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const { conversation } = useChatContext();
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;

  const handleClick = useCallback(() => {
    if (isDisabled) return;
    setShowDocumentSelector(true);
  }, [isDisabled]);

  const handleConfirm = useCallback(
    (selectedDocuments: DocumentListItem[]) => {
      console.log('Selected documents:', selectedDocuments);
      // Documents are already stored in localStorage by DocumentSelector
      setShowDocumentSelector(false);
    },
    [],
  );

  return (
    <>
      <TooltipAnchor
        render={
          <button
            disabled={isDisabled}
            onClick={handleClick}
            id="tools-dropdown-button"
            aria-label="Select Documents"
            className={cn(
              'flex items-center justify-center rounded-lg px-0.5 py-2 bg-white dark:bg-gray-800 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
              isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
            )}
          >
            <span className="text-sm font-normal text-[#2434E7] whitespace-nowrap">
              Select Documents
            </span>
          </button>
        }
        id="tools-dropdown-button"
        description={localize('com_ui_tools')}
        disabled={isDisabled}
      />
      <DocumentSelector
        isOpen={showDocumentSelector}
        onOpenChange={setShowDocumentSelector}
        onConfirm={handleConfirm}
        conversationId={conversationId}
      />
    </>
  );
};

export default React.memo(ToolsDropdown);
