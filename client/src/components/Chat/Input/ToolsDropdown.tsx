import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TooltipAnchor } from '@librechat/client';
import { X } from 'lucide-react';
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
  document_id: string;
  file_path?: string;
  status?: string;
}

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const [showDocumentPopover, setShowDocumentPopover] = useState(false);
  const { conversation } = useChatContext();
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const [selectedDocuments, setSelectedDocuments] = useState<StoredDocument[]>([]);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    // Clear both current conversation and NEW_CONVO fallback to prevent stale data
    localStorage.removeItem(`persona_documents_${convoId}`);
    if (convoId !== Constants.NEW_CONVO) {
      localStorage.removeItem(`persona_documents_${Constants.NEW_CONVO}`);
    }
    setSelectedDocuments([]);
    window.dispatchEvent(new Event('documentsUpdated'));
  }, [conversationId]);

  const handleRemoveDocument = useCallback((documentId: string) => {
    const convoId = conversationId || Constants.NEW_CONVO;
    const updatedDocuments = selectedDocuments.filter(doc => doc.document_id !== documentId);
    
    if (updatedDocuments.length === 0) {
      // If no documents left, clear storage
      localStorage.removeItem(`persona_documents_${convoId}`);
      if (convoId !== Constants.NEW_CONVO) {
        localStorage.removeItem(`persona_documents_${Constants.NEW_CONVO}`);
      }
    } else {
      // Update storage with remaining documents
      localStorage.setItem(
        `persona_documents_${convoId}`,
        JSON.stringify({
          documents: updatedDocuments,
          timestamp: Date.now(),
        }),
      );
    }
    
    setSelectedDocuments(updatedDocuments);
    window.dispatchEvent(new Event('documentsUpdated'));
  }, [conversationId, selectedDocuments]);

  const updatePopoverPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const gap = 8;
      
      // Get actual popover height if available, otherwise estimate
      let popoverHeight = 300; // Default estimate
      if (popoverRef.current) {
        popoverHeight = Math.min(popoverRef.current.offsetHeight, 300);
      }
      
      // Calculate if there's enough space below
      const spaceBelow = viewportHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      
      let top: number;
      let left = rect.left;
      
      // Position above if not enough space below
      if (spaceBelow < Math.min(popoverHeight, 150) && spaceAbove > spaceBelow) {
        // Position above the button
        if (popoverRef.current) {
          top = rect.top - popoverRef.current.offsetHeight - gap;
        } else {
          top = rect.top - 200 - gap; // Estimate
        }
        // Ensure it doesn't go above viewport
        if (top < 8) {
          top = 8;
        }
      } else {
        // Position below the button
        top = rect.bottom + gap;
        // Ensure it doesn't go below viewport
        const maxTop = viewportHeight - Math.min(popoverHeight, 300) - 16;
        if (top > maxTop) {
          top = maxTop;
        }
      }
      
      // Ensure popover doesn't go off the right edge
      const popoverWidth = 320; // 80 * 4 (w-80)
      if (left + popoverWidth > viewportWidth) {
        left = viewportWidth - popoverWidth - 16; // 16px padding from edge
      }
      
      // Ensure popover doesn't go off the left edge
      if (left < 16) {
        left = 16;
      }
      
      setPopoverPosition({ top, left });
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    updatePopoverPosition();
    setShowDocumentPopover(true);
  }, [updatePopoverPosition]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setShowDocumentPopover(false);
    }, 200); // 200ms delay before hiding
  }, []);

  // Handle clicking outside the popover to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showDocumentPopover &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowDocumentPopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDocumentPopover]);

  // Update popover position after render and on scroll/resize
  useEffect(() => {
    if (showDocumentPopover) {
      // Update position after popover is rendered to get accurate dimensions
      const timeoutId = setTimeout(() => {
        updatePopoverPosition();
      }, 0);
      
      const handleUpdate = () => updatePopoverPosition();
      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);
      
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    }
  }, [showDocumentPopover, updatePopoverPosition, selectedDocuments.length]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className="relative" style={{ zIndex: 'auto' }}>
        {documentCount === 0 ? (
          <TooltipAnchor
            render={
              <button
                ref={buttonRef}
                disabled={isDisabled}
                onClick={handleClick}
                id="tools-dropdown-button"
                aria-label="Select Documents"
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-[2px] border border-fig-Stroke-standard',
                  'bg-transparent px-[9px] text-sm font-normal leading-5 text-fig-Subject-standard',
                  'transition-colors hover:bg-fig-Surface-one-standard',
                  isDisabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {buttonText}
              </button>
            }
            id="tools-dropdown-button"
            description={localize('com_ui_tools')}
            disabled={isDisabled}
          />
        ) : (
          <button
            ref={buttonRef}
            disabled={isDisabled}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            id="tools-dropdown-button"
            aria-label="Select Documents"
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[2px] border border-fig-Stroke-standard',
              'bg-transparent px-[9px] text-sm font-normal leading-5 text-fig-Subject-standard',
              'transition-colors hover:bg-fig-Surface-one-standard',
              isDisabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {buttonText}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClearDocuments();
              }}
              className="ml-1 flex-shrink-0 rounded p-0.5 hover:bg-fig-Surface-one-standard"
              aria-label="Clear all documents"
            >
              <span className="text-xs">✕</span>
            </button>
          </button>
        )}
      </div>

      {/* Portal-rendered Popover for Selected Documents */}
      {showDocumentPopover && documentCount > 0 && createPortal(
        <div
          ref={popoverRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3"
          style={{ 
            position: 'fixed',
            top: `${Math.max(8, popoverPosition.top)}px`,
            left: `${popoverPosition.left}px`,
            maxHeight: 'min(300px, calc(100vh - 16px))', 
            overflowY: 'auto',
            zIndex: 9999,
          }}
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Selected Documents
          </div>
          <div className="flex flex-col gap-1.5">
            {selectedDocuments.map((doc) => (
              <div
                key={doc.document_id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <img 
                    src="/assets/documents.svg" 
                    alt="Document" 
                    className="h-3 w-3 flex-shrink-0 opacity-70 dark:invert" 
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={doc.filename || doc.name || 'Unknown'}>
                    {doc.filename || doc.name || 'Unknown'}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveDocument(doc.document_id);
                  }}
                  className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                  aria-label={`Remove ${doc.filename || doc.name || 'document'}`}
                >
                  <X className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

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
