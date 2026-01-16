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
      style={{ height: '34px' }}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border border-border-light bg-transparent px-3 text-sm font-medium text-text-primary transition-all hover:bg-surface-hover',
        isDisabled && 'opacity-50 cursor-not-allowed',
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
