import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, FileText, Calendar, User, AlertCircle, RefreshCw } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { fetchDocuments, DocumentListItem } from '~/data-provider/document-service';
import { cn } from '~/utils';

interface DocumentSelectionProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedDocuments: DocumentListItem[]) => void;
  selectedDocuments?: DocumentListItem[];
}

export default function DocumentSelection({
  isOpen,
  onClose,
  onConfirm,
  selectedDocuments = []
}: DocumentSelectionProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Initialize selected documents
  useEffect(() => {
    if (selectedDocuments.length > 0) {
      setSelected(new Set(selectedDocuments.map(doc => doc.filename)));
    }
  }, [selectedDocuments]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('[DocumentSelection] Fetching documents from API...');
      const response = await fetchDocuments('all');
      console.log('[DocumentSelection] API response:', response);
      
      if (response.code === 200 && response.data) {
        console.log('[DocumentSelection] Documents loaded successfully:', response.data.length, 'documents');
        setDocuments(response.data);
      } else {
        const errorMsg = response.message || `API returned code ${response.code}`;
        console.error('[DocumentSelection] API error:', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('[DocumentSelection] Error fetching documents:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load documents';
      setError(errorMessage);
      showToast({
        message: `Document loading failed: ${errorMessage}`,
        status: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen, loadDocuments]);

  const handleToggleDocument = useCallback((filename: string) => {
    setSelected(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(filename)) {
        newSelected.delete(filename);
      } else {
        newSelected.add(filename);
      }
      return newSelected;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const selectedDocs = documents.filter(doc => selected.has(doc.filename));
    onConfirm(selectedDocs);
    onClose();
  }, [documents, selected, onConfirm, onClose]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'indexed':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'active':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'processing':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'draft':
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800';
      case 'review':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800';
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/25 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Select documents
          </h2>
          <div className="flex items-center gap-2">
            {!loading && (
              <button
                onClick={loadDocuments}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                title="Refresh documents"
              >
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
              <button
                onClick={loadDocuments}
                className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-800 rounded"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                <span className="text-gray-600 dark:text-gray-400">Loading documents...</span>
              </div>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400">No documents available</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              {/* Table Header */}
              <div className="sticky top-0 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <div className="grid grid-cols-12 gap-4 px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <div className="col-span-1"></div>
                  <div className="col-span-4">Name</div>
                  <div className="col-span-2">Owner</div>
                  <div className="col-span-2">Format</div>
                  <div className="col-span-2">Upload date</div>
                  <div className="col-span-1">Status</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {documents.map((doc) => (
                  <div
                    key={doc.filename}
                    className={cn(
                      'grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors',
                      selected.has(doc.filename) && 'bg-blue-50 dark:bg-blue-900/20'
                    )}
                    onClick={() => handleToggleDocument(doc.filename)}
                  >
                    <div className="col-span-1 flex items-center">
                      <div className={cn(
                        'w-4 h-4 border-2 rounded flex items-center justify-center',
                        selected.has(doc.filename)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 dark:border-gray-600'
                      )}>
                        {selected.has(doc.filename) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                    </div>
                    
                    <div className="col-span-4 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {doc.filename}
                        </p>
                        {doc.company_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {doc.company_name}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="col-span-2 flex items-center">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {doc.owner}
                        </span>
                      </div>
                    </div>
                    
                    <div className="col-span-2 flex items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400 uppercase">
                        {doc.format}
                      </span>
                    </div>
                    
                    <div className="col-span-2 flex items-center">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(doc.upload_date)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="col-span-1 flex items-center">
                      <span className={cn(
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                        getStatusColor(doc.status)
                      )}>
                        {doc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selected.size} document{selected.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Confirm selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside of any dropdown containers
  return createPortal(modalContent, document.body);
}
