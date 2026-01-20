import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, X, Calendar, Check, ChevronRight, Home } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, useToastContext } from '@librechat/client';
import { useLocalize, useMCPServerManager } from '~/hooks';
import { type DocumentListItem } from '~/data-provider/document-service';
import { Constants } from 'librechat-data-provider';
import { cn } from '~/utils';
import { saasApi } from '~/services/saasApi';

interface DocumentSelectorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selectedDocuments: DocumentListItem[]) => void;
  conversationId?: string | null;
}

interface FolderNode {
  id: string;
  name: string;
  path: string;
  parent_id?: string;
  children?: FolderNode[];
  files?: FileNode[];
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

interface FileNode {
  id: string;
  document_id?: number;
  name: string;
  extension?: string;
  size_bytes?: number;
  created_at: string;
  storage_key?: string;
  created_by?: string;
  created_by_name?: string;
  uploaded_at?: string;
  status?: string;
}

export default function DocumentSelector({
  isOpen,
  onOpenChange,
  onConfirm,
  conversationId,
}: DocumentSelectorProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const mcpServerManager = useMCPServerManager({ conversationId: conversationId || null });
  const [allFolders, setAllFolders] = useState<FolderNode[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Home' }]);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);

  const MAX_DOCUMENTS = 5;

  // Load user info to get orgId
  useEffect(() => {
    if (isOpen) {
      const loadUserInfo = async () => {
        try {
          const user: any = await saasApi.getMe();
          setUserInfo(user);
        } catch (err) {
          console.error('Error loading user info:', err);
        }
      };
      loadUserInfo();
    }
  }, [isOpen]);

  // Find folder by ID in tree
  const findFolder = (folders: FolderNode[], id: string | null): FolderNode | null => {
    if (!id) return null;
    for (const folder of folders) {
      if (folder.id === id) return folder;
      if (folder.children) {
        const found = findFolder(folder.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Find Reports folder and exclude it
  const findReportsFolder = (folders: FolderNode[]): FolderNode | null => {
    for (const folder of folders) {
      if (folder.name.toLowerCase() === 'reports') {
        return folder;
      }
      if (folder.children && folder.children.length > 0) {
        const found = findReportsFolder(folder.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Get current folder and its contents
  const currentFolder = useMemo(() => {
    const reportsFolder = findReportsFolder(allFolders);
    const reportsFolderId = reportsFolder?.id;

    // Helper function to recursively filter out Reports folder
    const filterReportsFolder = (folders: FolderNode[]): FolderNode[] => {
      return folders
        .filter(f => f.id !== reportsFolderId)
        .map(folder => ({
          ...folder,
          children: folder.children ? filterReportsFolder(folder.children) : undefined,
        }));
    };

    let folders: FolderNode[];
    let files: FileNode[];

    // Show current folder contents only
    if (!currentFolderId) {
      // Root level - return all root folders except Reports
      const filteredRootFolders = allFolders.filter(f => !f.parent_id && f.id !== reportsFolderId);
      folders = filterReportsFolder(filteredRootFolders);
      files = [] as FileNode[];
    } else {
      const folder = findFolder(allFolders, currentFolderId);
      const filteredChildren = folder?.children ? filterReportsFolder(folder.children) : [];
      folders = filteredChildren;
      files = folder?.files || [];
    }

    return { folders, files };
  }, [currentFolderId, allFolders]);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!userInfo) {
        setLoading(false);
        return;
      }

      // Check if user is superadmin (handle both boolean true and string "true")
      const isSuperAdmin = userInfo?.is_super_admin === true || userInfo?.is_super_admin === 'true' || userInfo?.is_super_admin === 1;
      const userOrgId = userInfo?.org_id || null;

      // For non-superadmins, org_id is required
      if (!isSuperAdmin) {
        if (!userOrgId) {
          setError('Organization ID is required.');
          setAllFolders([]);
          setLoading(false);
          return;
        }
      }

      // Determine which org_id to use
      let orgIdToUse: string | null = null;
      if (isSuperAdmin) {
        // For superadmins, try to use their org_id if available
        // If not available, try to get the first organization
        if (userOrgId) {
          orgIdToUse = userOrgId;
        } else {
          // Try to get organizations and use the first one
          try {
            const orgs = await saasApi.getOrganizations(true);
            const orgsArray = Array.isArray(orgs) ? orgs : (orgs as any)?.organizations || (orgs as any)?.data || [];
            if (orgsArray.length > 0) {
              orgIdToUse = orgsArray[0].id;
            }
          } catch (orgErr) {
            console.warn('Could not fetch organizations for superadmin:', orgErr);
          }
        }
      } else {
        orgIdToUse = userOrgId;
      }

      // If still no org_id and we need one, show error
      if (!orgIdToUse) {
        if (isSuperAdmin) {
          setError('Please ensure you have access to at least one organization.');
        } else {
          setError('Organization ID is required.');
        }
        setAllFolders([]);
        setLoading(false);
        return;
      }

      const data = await saasApi.getFolderTree(orgIdToUse);
      setAllFolders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading folders:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load folders';
      // Check if error is about organization ID
      if (errorMessage.toLowerCase().includes('organization') || errorMessage.toLowerCase().includes('org')) {
        setError(errorMessage);
      } else {
        setError('Failed to load folders. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [userInfo]);

  useEffect(() => {
    if (isOpen && userInfo) {
      loadFolders();
    }
  }, [isOpen, userInfo, loadFolders]);

  // Initialize selected documents from localStorage when modal opens
  useEffect(() => {
    if (isOpen && !loading) {
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
            const storedIds = new Set<string>();
            documentData.documents.forEach((doc: any) => {
              if (doc.document_id) {
                storedIds.add(doc.document_id.toString());
              }
            });
            setSelectedDocuments(storedIds);
          }
        } catch (error) {
          console.error('Error parsing document data from localStorage:', error);
        }
      }
    } else if (!isOpen) {
      setSelectedDocuments(new Set());
      setCurrentFolderId(null);
      setBreadcrumbs([{ id: null, name: 'Home' }]);
    }
  }, [isOpen, loading, conversationId]);

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setBreadcrumbs([{ id: null, name: 'Home' }]);
    } else {
      const buildBreadcrumbs = (folders: FolderNode[], targetId: string, path: Array<{ id: string; name: string }> = []): Array<{ id: string; name: string }> | null => {
        for (const folder of folders) {
          if (folder.id === targetId) {
            return [...path, { id: folder.id, name: folder.name }];
          }
          if (folder.children) {
            const result = buildBreadcrumbs(folder.children, targetId, [...path, { id: folder.id, name: folder.name }]);
            if (result) return result;
          }
        }
        return null;
      };
      const crumbs = buildBreadcrumbs(allFolders, folderId);
      setBreadcrumbs([{ id: null, name: 'Home' }, ...(crumbs || [{ id: folderId, name: folderName }])]);
    }
  };

  const handleToggleSelection = useCallback((documentId: number) => {
    setSelectedDocuments((prev) => {
      const newSet = new Set(prev);
      const idStr = documentId.toString();
      if (newSet.has(idStr)) {
        // Deselecting - always allowed
        newSet.delete(idStr);
      } else {
        // Selecting - check if limit reached
        if (newSet.size >= MAX_DOCUMENTS) {
          showToast({
            message: `You can select a maximum of ${MAX_DOCUMENTS} documents. Please deselect a document before selecting another.`,
            status: 'error',
          });
          return prev; // Don't update the state
        }
        newSet.add(idStr);
      }
      return newSet;
    });
  }, [showToast]);

  // Convert FileNode to DocumentListItem for selected documents
  const convertFileToDocument = useCallback((file: FileNode): DocumentListItem | null => {
    if (!file.document_id) return null;
    return {
      document_id: file.document_id,
      name: file.name,
      file_path: file.storage_key || file.name,
      status: file.status || 'Completed',
      uploaded_at: file.uploaded_at || file.created_at,
      owner: file.created_by_name || 'System',
    };
  }, []);

  // Collect all documents from folder tree
  const getAllDocuments = useCallback((folders: FolderNode[]): DocumentListItem[] => {
    const documents: DocumentListItem[] = [];
    const collectDocuments = (folder: FolderNode) => {
      if (folder.files) {
        folder.files.forEach(file => {
          const doc = convertFileToDocument(file);
          if (doc) {
            documents.push(doc);
          }
        });
      }
      if (folder.children) {
        folder.children.forEach(child => collectDocuments(child));
      }
    };
    folders.forEach(folder => collectDocuments(folder));
    return documents;
  }, [convertFileToDocument]);

  const handleConfirm = useCallback(() => {
    const allDocs = getAllDocuments(allFolders);
    const selected = allDocs.filter((doc) => selectedDocuments.has(doc.document_id.toString()));

    // Store selected documents in localStorage for document_search MCP
    if (conversationId) {
      const documentsToStore = selected.map(doc => ({
        filename: doc.name,
        document_id: doc.document_id,
        file_path: doc.file_path,
        status: doc.status,
      }));
      console.log('[DocumentSelector] Storing documents in localStorage:', {
        conversationId,
        key: `persona_documents_${conversationId}`,
        documents: documentsToStore,
        document_ids: documentsToStore.map(d => d.document_id),
      });
      
      // If no documents selected, clear both current and NEW_CONVO storage
      if (selected.length === 0) {
        localStorage.removeItem(`persona_documents_${conversationId}`);
        if (conversationId !== Constants.NEW_CONVO) {
          localStorage.removeItem(`persona_documents_${Constants.NEW_CONVO}`);
        }
      } else {
        // Store documents for current conversation
        localStorage.setItem(
          `persona_documents_${conversationId}`,
          JSON.stringify({
            documents: documentsToStore,
            timestamp: Date.now(),
          }),
        );
      }
      
      // Dispatch custom event to notify other components (like SelectedDocuments)
      window.dispatchEvent(new Event('documentsUpdated'));

      // Auto-select document-search MCP when documents are selected
      if (selected.length > 0) {
        const currentMCPValues = mcpServerManager.mcpValues || [];
        if (!currentMCPValues.includes('document_search')) {
          mcpServerManager.batchToggleServers([...currentMCPValues, 'document_search']);
        }
      } else {
        // Deselect document-search MCP if no documents are selected
        const currentMCPValues = mcpServerManager.mcpValues || [];
        if (currentMCPValues.includes('document_search')) {
          mcpServerManager.batchToggleServers(currentMCPValues.filter(s => s !== 'document_search'));
        }
      }
    }
    onConfirm(selected);
    onOpenChange(false);
  }, [allFolders, selectedDocuments, conversationId, onConfirm, onOpenChange, mcpServerManager, getAllDocuments]);

  const handleDismiss = useCallback(() => {
    setSelectedDocuments(new Set());
    onOpenChange(false);
  }, [onOpenChange]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) {
      return 'N/A';
    }
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  const getFileExtension = (filename: string) => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'PDF';
  };

  const getStatusColor = (status: string) => {
    if (status === 'Completed' || status === 'completed' || status === 'indexed') {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    } else if (status === 'Failed' || status === 'failed' || status === 'error') {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    } else if (status === 'Pending' || status === 'pending' || status === 'Processing' || status === 'processing' || status === 'Embedding' || status === 'embedding') {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  };

  // Get all files from current folder view
  const currentFiles = currentFolder.files || [];

  // Get selected documents with their names
  const selectedDocumentsList = useMemo(() => {
    const allDocs = getAllDocuments(allFolders);
    return allDocs.filter((doc) => selectedDocuments.has(doc.document_id.toString()));
  }, [selectedDocuments, allFolders, getAllDocuments]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
            <DialogTitle 
              className="text-xl font-semibold text-gray-900 dark:text-gray-100"
              title={selectedDocumentsList.length > 0 ? selectedDocumentsList.map(doc => doc.name).join('\n') : ''}
            >
              Select documents
            </DialogTitle>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedDocumentsList.length} of {MAX_DOCUMENTS} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadFolders}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                aria-label="Refresh"
              >
                <RefreshCw className={cn('h-5 w-5 text-gray-700 dark:text-gray-300', loading && 'animate-spin')} />
              </button>
              <button
                onClick={handleDismiss}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Selected Documents Section */}
        {selectedDocumentsList.length > 0 && (
          <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Selected Documents:
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedDocumentsList.map((doc) => (
                  <div
                    key={doc.document_id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                  >
                    <img 
                      src="/assets/documents.svg" 
                      alt="Document" 
                      className="h-3 w-3 flex-shrink-0 opacity-70 dark:invert" 
                    />
                    <span className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]" title={doc.name}>
                      {doc.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelection(doc.document_id);
                      }}
                      className="ml-1 flex-shrink-0 rounded p-0.5 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      aria-label={`Remove ${doc.name}`}
                    >
                      <X className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm flex-1 min-w-0 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
            <div className="flex items-center gap-2 whitespace-nowrap">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.id || 'home'} className="flex items-center gap-2">
                  {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />}
                  <button
                    onClick={() => navigateToFolder(crumb.id, crumb.name)}
                    className={cn(
                      'px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 whitespace-nowrap',
                      index === breadcrumbs.length - 1 ? 'font-semibold' : ''
                    )}
                  >
                    {index === 0 ? <Home className="h-4 w-4 inline mr-1" /> : null}
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex-shrink-0">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : currentFolder.folders.length === 0 && currentFiles.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                This folder is empty
              </div>
            ) : (
              <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mx-6 my-4">
                <table className="w-full table-fixed border-separate border-spacing-0">
                  <colgroup>
                    <col style={{ width: '40%' }} />
                    <col style={{ width: currentFiles.length > 0 ? '15%' : '30%' }} />
                    {currentFiles.length > 0 && <col style={{ width: '10%' }} />}
                    <col style={{ width: currentFiles.length > 0 ? '20%' : '30%' }} />
                    {currentFiles.length > 0 && <col style={{ width: '15%' }} />}
                  </colgroup>
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                        Name
                      </th>
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                        Owner
                      </th>
                      {currentFiles.length > 0 && (
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                          Format
                        </th>
                      )}
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                        Upload date
                      </th>
                      {currentFiles.length > 0 && (
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                          Status
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {/* Folders - not selectable, clickable for navigation */}
                    {currentFolder.folders.map((folder) => {
                      const folderFileCount = folder.files?.length || 0;
                      return (
                        <tr
                          key={folder.id}
                          className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                          onClick={() => navigateToFolder(folder.id, folder.name)}
                        >
                          <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                <img src="/assets/Folder.svg" alt="Folder" className="h-4 w-4 dark:invert" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                  {folder.name}
                                </div>
                                {folderFileCount > 0 && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {folderFileCount} doc{folderFileCount !== 1 ? 's' : ''}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {folder.created_by_name || 'System'}
                          </td>
                          {currentFiles.length > 0 && (
                            <td className="px-3 py-3"></td>
                          )}
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span>{formatDate(folder.created_at)}</span>
                            </div>
                          </td>
                          {currentFiles.length > 0 && (
                            <td className="px-3 py-3"></td>
                          )}
                        </tr>
                      );
                    })}
                    {/* Documents - selectable only if Completed */}
                    {currentFiles.map((file) => {
                      if (!file.document_id) return null;
                      const isSelected = selectedDocuments.has(file.document_id.toString());
                      const fileStatus = file.status || 'Completed';
                      const isCompleted = fileStatus.toLowerCase() === 'completed' || fileStatus.toLowerCase() === 'indexed';
                      const isDisabled = !isCompleted;
                      
                      return (
                        <tr
                          key={file.document_id}
                          className={cn(
                            'group transition-colors',
                            isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50',
                            isSelected && 'bg-blue-50 dark:bg-blue-900/20',
                          )}
                          onClick={() => !isDisabled && handleToggleSelection(file.document_id!)}
                        >
                          <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 transition-colors">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'w-5 h-5 border-2 rounded flex items-center justify-center flex-shrink-0',
                                  isDisabled ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700' :
                                  isSelected
                                    ? 'border-blue-500 bg-blue-500'
                                    : 'border-gray-300 dark:border-gray-600',
                                )}
                              >
                                {isSelected && !isDisabled && <Check className="h-3 w-3 text-white" />}
                              </div>
                              <div className="flex items-center gap-2 min-w-0">
                                <img 
                                  src="/assets/documents.svg" 
                                  alt="Document" 
                                  className="h-3.5 w-3.5 flex-shrink-0 opacity-70 dark:invert dark:opacity-70" 
                                />
                                <div className="min-w-0">
                                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                    {file.name}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {file.created_by_name || 'System'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {getFileExtension(file.name)}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span>{formatDate(file.uploaded_at || file.created_at)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                'px-2 py-1 text-xs rounded-full',
                                getStatusColor(fileStatus),
                              )}
                            >
                              {fileStatus.charAt(0).toUpperCase() + fileStatus.slice(1).toLowerCase()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-white dark:bg-gray-800 flex-shrink-0">
          <Button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Confirm selection
          </Button>
          <Button
            type="button"
            onClick={handleDismiss}
            variant="outline"
            className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium"
          >
            Dismiss
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}