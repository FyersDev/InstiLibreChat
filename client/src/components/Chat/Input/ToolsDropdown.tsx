import React, { useState, useCallback, useEffect, useMemo } from 'react';
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

interface StoredDocument {
  filename?: string;
  name?: string;
  document_id: number;
  file_path?: string;
  status?: string;
}

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const { conversation } = useChatContext();
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const [selectedDocuments, setSelectedDocuments] = useState<StoredDocument[]>([]);

  const loadSelectedDocuments = useCallback(() => {
    const convoId = conversationId || Constants.NEW_CONVO;
    let documentDataStr = localStorage.getItem(`persona_documents_${convoId}`);
    
    // Fallback to NEW_CONVO if current convo doesn't have data (handles migration timing)
    if (!documentDataStr && convoId !== Constants.NEW_CONVO) {
      documentDataStr = localStorage.getItem(`persona_documents_${Constants.NEW_CONVO}`);
    }
    
    if (documentDataStr) {
      try {
        const documentData = JSON.parse(documentDataStr);
        if (documentData.documents && Array.isArray(documentData.documents)) {
          setSelectedDocuments(documentData.documents as StoredDocument[]);
        } else {
          setSelectedDocuments([]);
        }
      } catch (error) {
        console.error('Error parsing document data:', error);
        setSelectedDocuments([]);
      }
    } else {
      setSelectedDocuments([]);
    }
  }, [conversationId]);

  useEffect(() => {
    loadSelectedDocuments();
    
    const handleDocumentsUpdated = () => {
      loadSelectedDocuments();
    };
    
    window.addEventListener('documentsUpdated', handleDocumentsUpdated);
    window.addEventListener('storage', handleDocumentsUpdated);
    
    return () => {
      window.removeEventListener('documentsUpdated', handleDocumentsUpdated);
      window.removeEventListener('storage', handleDocumentsUpdated);
    };
  }, [loadSelectedDocuments]);

  const handleClick = useCallback(() => {
    if (isDisabled) return;
    setShowDocumentSelector(true);
  }, [isDisabled]);

  const handleConfirm = useCallback(
    (selectedDocuments: DocumentListItem[]) => {
      console.log('Selected documents:', selectedDocuments);
      // Documents are already stored in localStorage by DocumentSelector
      setShowDocumentSelector(false);
      loadSelectedDocuments();
    },
    [loadSelectedDocuments],
  );

  const documentCount = useMemo(() => selectedDocuments.length, [selectedDocuments.length]);
  
  const documentNames = useMemo(() => {
    return selectedDocuments
      .map(doc => doc.filename || doc.name || 'Unknown')
      .join('\n');
  }, [selectedDocuments]);

  const buttonText = documentCount > 0 
    ? `${documentCount} ${documentCount === 1 ? 'document' : 'documents'} selected` 
    : 'Select Documents';

  const tooltipText = documentCount > 0 ? documentNames : localize('com_ui_tools');

  const handleClearDocuments = useCallback(() => {
    const convoId = conversationId || Constants.NEW_CONVO;
    localStorage.removeItem(`persona_documents_${convoId}`);
    setSelectedDocuments([]);
    window.dispatchEvent(new Event('documentsUpdated'));
  }, [conversationId]);

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
      {buttonText}
      {documentCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClearDocuments();
          }}
          className="ml-1 flex-shrink-0 rounded p-0.5 hover:bg-surface-hover"
          aria-label="Clear all documents"
        >
          <span className="text-xs">✕</span>
        </button>
      )}
    </button>
  }
  id="tools-dropdown-button"
  description={tooltipText}
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
