import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Check, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  useToastContext,
  Spinner,
} from '@librechat/client';
import { useLocalize, useMCPServerManager } from '~/hooks';
import { type DocumentListItem } from '~/data-provider/document-service';
import { Constants } from 'librechat-data-provider';
import { DOCUMENT_SEARCH_MCP_SERVER_NAME } from '~/constants/mcpServers';
import { cn } from '~/utils';
import { findResearchReportsFolderInTree } from '~/utils/researchFolders';
import { researchOwnerColumnLabel } from '~/utils/researchOwner';
import {
  formatDocumentPipelineStatus,
  pipelineStatusBadgeClassName,
  pipelineStatusBadgeStyle,
} from '~/utils/researchDocumentStatus';
import { saasApi } from '~/services/saasApi';
import { asset } from '~/utils/assetPath';

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
  folder_kind?: string;
  document_count?: number;
  total_document_count?: number;
  sub_folder_count?: number;
  total_sub_folder_count?: number;
}

interface FileNode {
  id: string;
  document_id?: string;
  name: string;
  extension?: string;
  size_bytes?: number;
  created_at: string;
  storage_key?: string;
  created_by?: string;
  created_by_name?: string;
  uploaded_at?: string;
  status?: string;
  error_message?: string;
}

function isPipelineStatusCompleted(raw: string | undefined | null): boolean {
  return String(raw ?? '').trim().toLowerCase() === 'completed';
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
  const [rootUnfiledFiles, setRootUnfiledFiles] = useState<FileNode[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Home' },
  ]);
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

  // Get current folder and its contents
  const currentFolder = useMemo(() => {
    const reportsFolder = findResearchReportsFolderInTree(allFolders);
    const reportsFolderId = reportsFolder?.id;

    // Helper function to recursively filter out Reports folder
    const filterReportsFolder = (folders: FolderNode[]): FolderNode[] => {
      return folders
        .filter((f) => f.id !== reportsFolderId)
        .map((folder) => ({
          ...folder,
          children: folder.children ? filterReportsFolder(folder.children) : undefined,
        }));
    };

    let folders: FolderNode[];
    let files: FileNode[];

    // Show current folder contents only
    if (!currentFolderId) {
      // Root level - return all root folders except Reports
      const filteredRootFolders = allFolders.filter(
        (f) => !f.parent_id && f.id !== reportsFolderId,
      );
      folders = filterReportsFolder(filteredRootFolders);
      files = rootUnfiledFiles;
    } else {
      const folder = findFolder(allFolders, currentFolderId);
      const filteredChildren = folder?.children ? filterReportsFolder(folder.children) : [];
      folders = filteredChildren;
      files = folder?.files || [];
    }

    return { folders, files };
  }, [currentFolderId, allFolders, rootUnfiledFiles]);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!userInfo) {
        setLoading(false);
        return;
      }

      // Check if user is superadmin (handle both boolean true and string "true")
      const isSuperAdmin =
        userInfo?.is_super_admin === true ||
        userInfo?.is_super_admin === 'true' ||
        userInfo?.is_super_admin === 1;
      const userOrgId = userInfo?.org_id || null;

      // For non-superadmins, org_id is required
      if (!isSuperAdmin) {
        if (!userOrgId) {
          setError('Organization ID is required.');
          setAllFolders([]);
          setRootUnfiledFiles([]);
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
            const orgsArray = Array.isArray(orgs)
              ? orgs
              : (orgs as any)?.organizations || (orgs as any)?.data || [];
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
        setRootUnfiledFiles([]);
        setLoading(false);
        return;
      }

      const data = await saasApi.getFolderTree(orgIdToUse);
      setAllFolders(data.folders);
      setRootUnfiledFiles(data.rootFiles);
    } catch (err) {
      console.error('Error loading folders:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load folders';
      // Check if error is about organization ID
      if (
        errorMessage.toLowerCase().includes('organization') ||
        errorMessage.toLowerCase().includes('org')
      ) {
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
      const buildBreadcrumbs = (
        folders: FolderNode[],
        targetId: string,
        path: Array<{ id: string; name: string }> = [],
      ): Array<{ id: string; name: string }> | null => {
        for (const folder of folders) {
          if (folder.id === targetId) {
            return [...path, { id: folder.id, name: folder.name }];
          }
          if (folder.children) {
            const result = buildBreadcrumbs(folder.children, targetId, [
              ...path,
              { id: folder.id, name: folder.name },
            ]);
            if (result) return result;
          }
        }
        return null;
      };
      const crumbs = buildBreadcrumbs(allFolders, folderId);
      setBreadcrumbs([
        { id: null, name: 'Home' },
        ...(crumbs || [{ id: folderId, name: folderName }]),
      ]);
    }
  };

  const handleNavigateBack = () => {
    if (breadcrumbs.length < 2) return;
    const parent = breadcrumbs[breadcrumbs.length - 2]!;
    navigateToFolder(parent.id, parent.name);
  };

  const handleToggleSelection = useCallback(
    (documentId: string) => {
      setSelectedDocuments((prev) => {
        const newSet = new Set(prev);
        const idStr = String(documentId);
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
    },
    [showToast],
  );

  // Convert FileNode to DocumentListItem for selected documents
  const convertFileToDocument = useCallback((file: FileNode): DocumentListItem | null => {
    if (!file.document_id) return null;
    return {
      document_id: String(file.document_id),
      name: file.name,
      file_path: file.storage_key || file.name,
      status: file.status?.trim() ? file.status : 'PENDING',
      uploaded_at: file.uploaded_at || file.created_at,
      owner: researchOwnerColumnLabel(file),
    };
  }, []);

  // Collect all documents from folder tree
  const getAllDocuments = useCallback(
    (folders: FolderNode[]): DocumentListItem[] => {
      const documents: DocumentListItem[] = [];
      const collectDocuments = (folder: FolderNode) => {
        if (folder.files) {
          folder.files.forEach((file) => {
            const doc = convertFileToDocument(file);
            if (doc) {
              documents.push(doc);
            }
          });
        }
        if (folder.children) {
          folder.children.forEach((child) => collectDocuments(child));
        }
      };
      folders.forEach((folder) => collectDocuments(folder));
      return documents;
    },
    [convertFileToDocument],
  );

  const handleConfirm = useCallback(() => {
    const allDocs = getAllDocuments(allFolders);
    const selected = allDocs.filter((doc) => selectedDocuments.has(doc.document_id.toString()));

    // Store selected documents in localStorage for document_search MCP
    if (conversationId) {
      const documentsToStore = selected.map((doc) => ({
        filename: doc.name,
        document_id: doc.document_id,
        file_path: doc.file_path,
        status: doc.status,
      }));
      console.log('[DocumentSelector] Storing documents in localStorage:', {
        conversationId,
        key: `persona_documents_${conversationId}`,
        documents: documentsToStore,
        document_ids: documentsToStore.map((d) => d.document_id),
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
        if (!currentMCPValues.includes(DOCUMENT_SEARCH_MCP_SERVER_NAME)) {
          mcpServerManager.batchToggleServers([
            ...currentMCPValues,
            DOCUMENT_SEARCH_MCP_SERVER_NAME,
          ]);
        }
      } else {
        // Deselect document-search MCP if no documents are selected
        const currentMCPValues = mcpServerManager.mcpValues || [];
        if (currentMCPValues.includes(DOCUMENT_SEARCH_MCP_SERVER_NAME)) {
          mcpServerManager.batchToggleServers(
            currentMCPValues.filter((s) => s !== DOCUMENT_SEARCH_MCP_SERVER_NAME),
          );
        }
      }
    }
    onConfirm(selected);
    onOpenChange(false);
  }, [
    allFolders,
    selectedDocuments,
    conversationId,
    onConfirm,
    onOpenChange,
    mcpServerManager,
    getAllDocuments,
  ]);

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

  // Get all files from current folder view
  const currentFiles = currentFolder.files || [];

  // Get selected documents with their names
  const selectedDocumentsList = useMemo(() => {
    const allDocs = getAllDocuments(allFolders);
    return allDocs.filter((doc) => selectedDocuments.has(doc.document_id.toString()));
  }, [selectedDocuments, allFolders, getAllDocuments]);

  const isFolderViewEmpty = currentFolder.folders.length === 0 && currentFiles.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-h-[90vh] w-full max-w-[var(--Size-overlay)] flex-col overflow-hidden p-0',
          'gap-0',
          'border border-fig-Stroke-soft !bg-fig-Surface-one-standard',
          'rounded-[var(--Corner-highlyRounded)]',
          'shadow-none',
          'text-fig-Subject-standard',
          'dark:!bg-fig-Surface-one-standard',
        )}
      >
        <DialogHeader
          className={cn(
            'mb-0 flex shrink-0 flex-col space-y-0 border-0',
            'px-[var(--Gap-parentChild)] py-[var(--Padding-sibling)]',
          )}
        >
          <div className="flex items-center justify-between gap-[var(--Gap-parentChild)]">
            <div className="flex min-w-0 flex-1 flex-col gap-[var(--Gap-zero-sibling)]">
              <DialogTitle className="fy-typography-title m-0 text-fig-Subject-standard">
                {localize('com_ui_select_document')}
              </DialogTitle>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={handleDismiss}
                className={cn(
                  'inline-flex h-[var(--Size-icon)] w-[var(--Size-icon)] items-center justify-center',
                  'rounded-[var(--Corner-moderatelyRounded)] text-fig-Subject-standard transition-colors',
                  'hover:bg-fig-Surface-neutral',
                  'focus:outline-none focus-visible:ring-fig-Stroke-primary',
                )}
                aria-label={localize('com_ui_close')}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="box-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-[var(--Gap-parentChild)]">
          <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col">
            <div
              className={cn(
                'flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col',
                'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                'bg-fig-Surface-standard p-[var(--Padding-spacer)]',
              )}
            >
              <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-[var(--Gap-zero-parentChild)] overflow-y-auto">
                <div className="flex w-full min-w-0 flex-col gap-[var(--Gap-zero-neighbor)]">
                  {currentFolderId !== null && breadcrumbs.length >= 2 ? (
                    <div className="flex w-full min-w-0 max-w-full items-center text-fig-Subject-standard">
                      <button
                        type="button"
                        onClick={handleNavigateBack}
                        className={cn(
                          'inline-flex min-h-[var(--Size-zero-button)] items-center gap-[var(--Gap-zero-neighbor)] rounded-[var(--Corner-moderatelyRounded)]',
                          'fy-typography-title-small text-fig-Subject-standard',
                          'transition-colors hover:bg-fig-Surface-neutral',
                          'focus:outline-none focus-visible:ring-fig-Stroke-primary',
                        )}
                        aria-label={localize('com_ui_back')}
                      >
                        <ArrowLeft
                          className="h-[var(--Size-icon)] w-[var(--Size-icon)] flex-shrink-0 text-fig-Subject-standard"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        {localize('com_ui_back')}
                      </button>
                    </div>
                  ) : null}
                  {selectedDocumentsList.length > 0 && (
                    <div className="w-full min-w-0 max-w-full">
                      <div className="flex flex-wrap gap-[var(--Gap-zero-neighbor)] pb-[var(--Gap-zero-parentChild)]">
                        {selectedDocumentsList.map((doc) => (
                          <div
                            key={doc.document_id}
                            className={cn(
                              'flex items-center gap-[var(--Gap-zero-neighbor)]',
                              'rounded-[var(--Corner-moderatelyRounded)]',
                              'bg-fig-Surface-neutral px-[var(--Padding-zero-sibling)] py-[var(--Padding-buddyVertical)]',
                            )}
                          >
                            <img
                              src={asset('documents.svg')}
                              alt=""
                              className="h-3 w-3 flex-shrink-0 opacity-80 dark:invert"
                            />
                            <span
                              className="fy-typography-label-small max-w-[200px] truncate text-fig-Subject-standard"
                              title={doc.name}
                            >
                              {doc.name}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelection(doc.document_id);
                              }}
                              className={cn(
                                'ml-0.5 h-[var(--Size-icon)] w-[var(--Size-icon)] flex-shrink-0 rounded-[var(--Corner-moderatelyRounded)] p-0.5',
                                'text-fig-Subject-soft transition-colors hover:bg-fig-Surface-one-standard',
                              )}
                              aria-label={`Remove ${doc.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {loading && (
                  <div className="flex h-64 items-center justify-center">
                    <Spinner size={32} />
                  </div>
                )}
                {!loading && isFolderViewEmpty && (
                  <div className="fy-typography-body-tiny flex h-64 min-h-0 items-center justify-center text-fig-Subject-soft">
                    {localize('com_ui_folder_empty')}
                  </div>
                )}
                {!loading && !isFolderViewEmpty && (
                  <div
                    className={cn(
                      'w-full min-w-0 max-w-full overflow-x-auto',
                      'rounded-[var(--Corner-highlyRounded)] border-[0.5px] border-fig-Stroke-soft',
                      'bg-fig-Surface-one-standard',
                    )}
                  >
                    <table className="w-full min-w-[480px] table-fixed border-separate border-spacing-0">
                      <colgroup>
                        <col style={{ width: '38%' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '22%' }} />
                        {/*
                        <col style={{ width: '40%' }} />
                        <col style={{ width: currentFiles.length > 0 ? '15%' : '30%' }} />
                        {currentFiles.length > 0 && <col style={{ width: '10%' }} />}
                        <col style={{ width: currentFiles.length > 0 ? '20%' : '30%' }} />
                        {currentFiles.length > 0 && <col style={{ width: '15%' }} />}
                        */}
                      </colgroup>
                      <thead className="bg-fig-Surface-one-neutral">
                        <tr>
                          <th
                            className={cn(
                              'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                              'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                            )}
                          >
                            {localize('com_ui_name')}
                          </th>
                          <th
                            className={cn(
                              'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                              'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                            )}
                          >
                            {localize('com_ui_table_owner')}
                          </th>
                          <th
                            className={cn(
                              'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                              'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                            )}
                          >
                            {localize('com_ui_table_status')}
                          </th>
                          <th
                            className={cn(
                              'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                              'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                            )}
                          >
                            {localize('com_ui_table_date_created')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-fig-Stroke-soft">
                        {/* Folders - not selectable, clickable for navigation */}
                        {currentFolder.folders.map((folder, rowIndex) => {
                          const folderFileCount =
                            folder.total_document_count ??
                            folder.document_count ??
                            folder.files?.length ??
                            0;
                          return (
                            <tr
                              key={folder.id}
                              className={cn(
                                'group cursor-pointer transition-colors',
                                'hover:bg-fig-Surface-neutral',
                                rowIndex % 2 === 0
                                  ? 'bg-fig-Surface-standard'
                                  : 'bg-fig-Surface-zero-neutral',
                              )}
                              onClick={() => navigateToFolder(folder.id, folder.name)}
                            >
                              <td
                                className={cn(
                                  'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                                  'border-r border-fig-Stroke-soft',
                                  'overflow-hidden',
                                )}
                              >
                                <div className="flex h-full min-h-0 items-center gap-2 sm:gap-[var(--Gap-neighbor)]">
                                  <div
                                    className={cn(
                                      'box-border flex h-[var(--Size-zero-button)] w-[var(--Size-zero-button)] shrink-0 items-center justify-center rounded-[2px] p-1',
                                      rowIndex % 2 === 0
                                        ? 'bg-fig-Surface-neutral'
                                        : 'bg-fig-Surface-one-neutral',
                                    )}
                                  >
                                    <img
                                      src="/research/assets/Folder.svg"
                                      alt=""
                                      className="block h-4 w-4 object-contain dark:invert"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="fy-typography-title-small truncate text-fig-Subject-standard">
                                      {folder.name}
                                    </div>
                                    {folderFileCount > 0 && (
                                      <div className="fy-typography-body-tiny text-fig-Subject-soft">
                                        {folderFileCount === 1
                                          ? localize('com_ui_one_doc')
                                          : localize('com_ui_folder_doc_count', {
                                              0: String(folderFileCount),
                                            })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td
                                className={cn(
                                  'p-[var(--Padding-spacer)] align-middle',
                                  'fy-typography-body text-fig-Subject-standard',
                                )}
                              >
                                <div
                                  className="truncate"
                                  title={researchOwnerColumnLabel(folder)}
                                >
                                  {researchOwnerColumnLabel(folder)}
                                </div>
                              </td>
                              <td
                                className={cn(
                                  'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                                  'fy-typography-body text-fig-Subject-soft',
                                )}
                              >
                                —
                              </td>
                              <td
                                className={cn(
                                  'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                                  'fy-typography-body text-fig-Subject-standard',
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-[var(--Gap-zero-sibling)]">
                                  <span>{formatDate(folder.created_at)}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {/* Documents - selectable only if Completed */}
                        {currentFiles
                          .filter((f) => f.document_id)
                          .map((file, j) => {
                            const rowIndex = currentFolder.folders.length + j;
                            const isSelected = selectedDocuments.has(file.document_id!.toString());
                            const displayStatus = formatDocumentPipelineStatus(file.status);
                            const isDisabled = !isPipelineStatusCompleted(file.status);
                            const checkboxClass = (() => {
                              if (isDisabled) {
                                return 'border-fig-Stroke-standard bg-fig-Surface-neutral';
                              }
                              if (isSelected) {
                                return 'border-fig-Surface-two-primary bg-fig-Surface-two-primary';
                              }
                              return 'border-fig-Surface-two-primary bg-fig-Surface-primary';
                            })();
                            return (
                              <tr
                                key={file.document_id}
                                className={cn(
                                  'group transition-colors',
                                  isDisabled &&
                                    (rowIndex % 2 === 0
                                      ? 'bg-fig-Surface-standard'
                                      : 'bg-fig-Surface-zero-neutral'),
                                  isDisabled && 'cursor-not-allowed opacity-50',
                                  !isDisabled &&
                                    cn(
                                      'cursor-pointer hover:bg-fig-Surface-neutral',
                                      rowIndex % 2 === 0
                                        ? 'bg-fig-Surface-standard'
                                        : 'bg-fig-Surface-zero-neutral',
                                    ),
                                )}
                                onClick={() =>
                                  !isDisabled && handleToggleSelection(file.document_id!)
                                }
                              >
                                <td
                                  className={cn(
                                    'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                                    'border-r border-fig-Stroke-soft',
                                    'overflow-hidden',
                                  )}
                                >
                                  <div className="flex h-full min-h-0 min-w-0 items-center gap-2 sm:gap-[var(--Gap-neighbor)]">
                                    <div
                                      className={cn(
                                        'flex h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] flex-shrink-0 items-center justify-center rounded-[var(--Corner-moderatelyRounded)] border',
                                        checkboxClass,
                                      )}
                                      aria-hidden
                                    >
                                      {isSelected && !isDisabled && (
                                        <Check className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] text-fig-Subject-two-primary" />
                                      )}
                                    </div>
                                    <div
                                      className={cn(
                                        'box-border flex h-[var(--Size-zero-button)] w-[var(--Size-zero-button)] shrink-0 items-center justify-center rounded-[2px] p-1',
                                        rowIndex % 2 === 0
                                          ? 'bg-fig-Surface-neutral'
                                          : 'bg-fig-Surface-one-neutral',
                                      )}
                                    >
                                      <img
                                        src={asset('documents.svg')}
                                        alt=""
                                        className="block h-3.5 w-3.5 flex-shrink-0 object-contain opacity-80 dark:invert"
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="fy-typography-title-small truncate text-fig-Subject-standard">
                                        {file.name}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td
                                  className={cn(
                                    'p-[var(--Padding-spacer)] align-middle',
                                    'fy-typography-body text-fig-Subject-standard',
                                  )}
                                >
                                  <div
                                    className="truncate"
                                    title={researchOwnerColumnLabel(file)}
                                  >
                                    {researchOwnerColumnLabel(file)}
                                  </div>
                                </td>
                                <td
                                  className={cn(
                                    'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      pipelineStatusBadgeClassName(displayStatus),
                                    )}
                                    style={pipelineStatusBadgeStyle(displayStatus)}
                                    title={
                                      displayStatus === 'FAILED' && file.error_message
                                        ? file.error_message
                                        : displayStatus
                                    }
                                  >
                                    {displayStatus}
                                  </span>
                                </td>
                                <td
                                  className={cn(
                                    'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                                    'fy-typography-body text-fig-Subject-standard',
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-[var(--Gap-zero-sibling)]">
                                    <span>{formatDate(file.uploaded_at || file.created_at)}</span>
                                  </div>
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
          </div>
        </div>

        <div
          className={cn(
            'flex shrink-0 items-center justify-end',
            'gap-[var(--Gap-zero-sibling)]',
            'px-[var(--Padding-spacer)] py-[var(--Padding-spacer)]',
          )}
        >
          <Button
            type="button"
            onClick={handleConfirm}
            className={cn(
              'flex h-[var(--Size-button)] items-center justify-center rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-primary',
              'bg-fig-Surface-two-primary px-[var(--Padding-spacer)] outline-offset-4',
              'fy-typography-label-small !text-fig-Subject-two-primary',
              'hover:!bg-fig-Surface-two-primary hover:!text-fig-Subject-two-primary',
              'transition-all disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {localize('com_ui_confirm')}
          </Button>
          <Button
            type="button"
            onClick={handleDismiss}
            variant="outline"
            className={cn(
              'flex h-[var(--Size-button)] items-center justify-center rounded-[var(--Corner-moderatelyRounded)]',
              'border border-fig-Stroke-standard',
              'bg-fig-Surface-one-standard',
              'px-[var(--Padding-spacer)] outline-offset-4',
              'fy-typography-label-small !text-fig-Subject-standard',
              'hover:!bg-fig-Surface-one-standard hover:!text-fig-Subject-standard',
              'transition-all disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {localize('com_ui_dismiss')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
