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
        'flex items-center justify-center rounded-lg px-2 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 whitespace-nowrap',
        'bg-[#F7F7F8] hover:bg-[#F7F7F8] dark:bg-[#2A2A2A] dark:hover:bg-[#2A2A2A]',
        isDisabled && 'opacity-50 cursor-not-allowed hover:bg-[#F7F7F8] dark:hover:bg-[#2A2A2A]',
      )}
    >
      Select Documents
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
