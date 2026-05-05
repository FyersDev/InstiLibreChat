import { Spinner, useToastContext } from '@librechat/client';
import { ChevronRight, Home, MoreVertical, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CreateFolderModal from '~/components/Resources/Modals/CreateFolderModal';
import EditFileModal from '~/components/Resources/Modals/EditFileModal';
import EditFolderModal from '~/components/Resources/Modals/EditFolderModal';
import UploadFileModal from '~/components/Resources/Modals/UploadFileModal';
import { saasApi } from '~/services/saasApi';
import { cn } from '~/utils';
import { PermissionManager } from '~/utils/permissions';
import {
  findResearchReportsFolderInTree,
  isResearchDefaultUploadFolder,
  researchRenameLocked,
} from '~/utils/researchFolders';
import { isResearchSystemRow, researchOwnerColumnLabel } from '~/utils/researchOwner';

interface FolderNode {
  id: string;
  name: string;
  path: string;
  parent_id?: string;
  children?: FolderNode[];
  files?: FileNode[];
  created_by?: string;
  /** From API `createdByName` / `created_by_name` via saasApi mapper. */
  created_by_name?: string;
  /** Fallback for Owner when display name is absent but email exists on the row/user object. */
  created_by_email?: string;
  created_at: string;
  /** Present when API sends org scope; `null` means system-managed (org_id null). */
  org_id?: string | null;
  is_system?: boolean;
  /** From Conflux (`folder_kind` / aliases); see `researchFolders.ts`. */
  folder_kind?: string;
  rename_locked?: boolean;
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
  created_by_email?: string;
  org_id?: string | null;
  is_system?: boolean;
}

/** API may send numeric `createdBy` / string user id — compare coercively. */
function sameCreatorAsCurrentUser(actorId: unknown, currentUserId: unknown): boolean {
  if (actorId === undefined || actorId === null || currentUserId === undefined || currentUserId === null) {
    return false;
  }
  return String(actorId) === String(currentUserId);
}

// Custom document icon component for list view
const DocumentIcon = ({ className }: { className?: string }) => (
  <img
    src="/research/assets/documents.svg"
    alt="Document"
    className={`${className || 'h-3 w-3'} opacity-70 dark:opacity-70 dark:brightness-0 dark:invert`}
  />
);

// Get file icon based on extension - always returns DocumentIcon
const getFileIcon = (extension?: string) => {
  return DocumentIcon;
};

// Format date for display
const formatDate = (dateString: string | undefined | null) => {
  if (!dateString) {
    return 'N/A';
  }

  try {
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return 'Invalid Date';
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (error) {
    console.error('Error parsing date:', dateString, error);
    return 'Invalid Date';
  }
};

export default function ResourcesRoute() {
  const { showToast } = useToastContext();
  const [allFolders, setAllFolders] = useState<FolderNode[]>([]);
  /** Documents with no folder from hierarchy `unfiledDocuments` (shown at Home). */
  const [rootUnfiledFiles, setRootUnfiledFiles] = useState<FileNode[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Home' },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<{
    type: 'folder' | 'file';
    id: string | number;
  } | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<FolderNode | null>(null);
  const [showUploadFileModal, setShowUploadFileModal] = useState(false);
  const [showEditFileModal, setShowEditFileModal] = useState(false);
  const [permissionManager, setPermissionManager] = useState<PermissionManager | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'documents' | 'reports'>('documents');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const isSuperAdmin = userInfo?.is_super_admin || false;
  const userOrgId =
    userInfo?.org_id ?? userInfo?.organization_id ?? userInfo?.organizationId ?? null;
  const orgRoleRaw = userInfo?.org_role ?? userInfo?.orgRole;
  const isOrgAdmin =
    typeof orgRoleRaw === 'string' && orgRoleRaw.trim().toLowerCase() === 'admin';

  useEffect(() => {
    loadUserInfo();
  }, []);

  useEffect(() => {
    if (userInfo) {
      if (isSuperAdmin) {
        loadOrganizations();
      } else {
        setSelectedOrgId(userOrgId || '');
        loadFolders(userOrgId);
      }
    }
  }, [userInfo]);

  useEffect(() => {
    if (isSuperAdmin && selectedOrgId) {
      localStorage.setItem('resources_selected_org_id', selectedOrgId);
      loadFolders(selectedOrgId);
    }
  }, [selectedOrgId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!selectedItem) {
      setDropdownPosition(null);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't close if clicking on dropdown trigger, menu, or modal
      if (
        target.closest('.dropdown-trigger') ||
        target.closest('[role="dialog"]') ||
        target.closest('.modal') ||
        showEditFolderModal ||
        showEditFileModal
      ) {
        return;
      }
      // Check if clicking on the portal dropdown
      if (target.closest('.fixed.w-48')) {
        return;
      }
      setSelectedItem(null);
      setDropdownPosition(null);
    };

    // Use a small delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedItem, showEditFolderModal, showEditFileModal]);

  const loadUserInfo = async () => {
    try {
      const user: any = await saasApi.getMe();
      setUserInfo(user);
      if (user) {
        let permissions = user.permissions || [];

        // If superadmin, grant ALL permissions automatically
        if (user.is_super_admin === true) {
          const resources = [
            'organizations',
            'users',
            'roles',
            'permissions',
            'folders',
            'files',
            'documents',
          ];
          const actions = ['read', 'create', 'update', 'delete'];

          permissions = resources.flatMap((resource: string) =>
            actions.map((action: string) => ({
              id: `${resource}-${action}`,
              resource,
              action,
            })),
          );

          console.log(
            '🔑 ResourcesRoute - Superadmin detected - granting all permissions:',
            permissions.length,
          );
        } else if (!permissions || permissions.length === 0) {
          const storedPerms = localStorage.getItem('permissions');
          if (storedPerms) {
            try {
              permissions = JSON.parse(storedPerms);
            } catch (e) {
              console.error('Error parsing stored permissions:', e);
            }
          }
        }

        const pm = new PermissionManager(permissions as any[]);
        setPermissionManager(pm);
      }
    } catch (err) {
      console.error('Error loading user info:', err);
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = await saasApi.getOrganizations(isSuperAdmin, undefined);
      // Handle both response formats
      const orgs = Array.isArray(data)
        ? data
        : (data as any).organizations || (data as any).data || ((data as any).id ? [data] : []);
      console.log('🏢 ResourcesRoute - Loaded organizations:', { count: orgs.length, orgs });
      setOrganizations(orgs);

      if (orgs.length > 0) {
        const savedOrgId = localStorage.getItem('resources_selected_org_id');
        if (savedOrgId && orgs.some((org: any) => org.id === savedOrgId)) {
          setSelectedOrgId(savedOrgId);
          return;
        }
        if (userOrgId) {
          const hasUserOrg = orgs.some((org: any) => org.id === userOrgId);
          if (hasUserOrg) {
            setSelectedOrgId(userOrgId);
            return;
          }
        }
        setSelectedOrgId(orgs[0].id);
      }
    } catch (err: any) {
      console.error('Error loading organizations:', err);
    }
  };

  const loadFolders = async (orgId?: string | null) => {
    try {
      setLoading(true);
      setError(null);

      if (isSuperAdmin) {
        if (organizations.length > 0 && !orgId && !selectedOrgId) {
          setAllFolders([]);
          setRootUnfiledFiles([]);
          setLoading(false);
          return;
        }
        const targetOrgId = orgId || selectedOrgId;
        if (!targetOrgId) {
          if (organizations.length > 0) {
            setError('Please select an organization to view its resources.');
          }
          setAllFolders([]);
          setRootUnfiledFiles([]);
          setLoading(false);
          return;
        }
        const data = await saasApi.getFolderTree(targetOrgId);
        setAllFolders(data.folders);
        setRootUnfiledFiles(data.rootFiles);
        return;
      }

      const targetOrgId = orgId || userOrgId;
      if (!targetOrgId) {
        setError('Organization ID is required.');
        setAllFolders([]);
        setRootUnfiledFiles([]);
        setLoading(false);
        return;
      }

      const data = await saasApi.getFolderTree(targetOrgId);
      setAllFolders(data.folders);
      setRootUnfiledFiles(data.rootFiles);
    } catch (err: any) {
      setError(err.message || 'Failed to load folders');
      console.error('Error loading folders:', err);
    } finally {
      setLoading(false);
    }
  };

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
    // Backend now filters folders by user_id, so we don't need client-side user filtering
    // We only need to filter out the Reports folder from the Documents tab

    // If Reports tab is active, show Reports folder content
    if (activeTab === 'reports') {
      const reportsFolder = findResearchReportsFolderInTree(allFolders);
      if (reportsFolder) {
        return {
          folders: reportsFolder.children || [],
          files: reportsFolder.files || [],
        };
      }
      return {
        folders: [],
        files: [],
      };
    }

    // Documents tab - normal behavior
    // Completely exclude Reports folder from Documents tab (recursively)
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

    if (!currentFolderId) {
      // Root level - return all root folders except Reports
      // Backend already filters by user_id, so we only show what the user has access to
      const rootFolders = allFolders.filter((f) => !f.parent_id && f.id !== reportsFolderId);
      return {
        folders: rootFolders,
        files: rootUnfiledFiles,
      };
    }

    // Inside a folder
    const folder = findFolder(allFolders, currentFolderId);
    if (!folder) {
      return {
        folders: [],
        files: [],
      };
    }

    return {
      folders: folder.children ? filterReportsFolder(folder.children) : [],
      files: folder.files || [],
    };
  }, [currentFolderId, allFolders, rootUnfiledFiles, activeTab]);

  // Filter folders and files based on search query
  const filteredContent = useMemo(() => {
    if (!searchQuery.trim()) {
      return currentFolder;
    }
    const query = searchQuery.toLowerCase();
    return {
      folders: currentFolder.folders.filter((f) => f.name.toLowerCase().includes(query)),
      files: currentFolder.files.filter((f) => f.name.toLowerCase().includes(query)),
    };
  }, [currentFolder, searchQuery]);

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setBreadcrumbs([{ id: null, name: 'Home' }]);
    } else {
      // Build breadcrumbs by finding path to folder
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
    setSelectedItem(null);
  };

  const handleDeleteFolder = async (folder: FolderNode) => {
    if (isResearchSystemRow(folder)) {
      showToast({
        message: 'System-managed folders cannot be deleted.',
        status: 'error',
      });
      return;
    }
    if (!confirm(`Delete folder "${folder.name}" and all its contents?`)) return;
    try {
      await saasApi.deleteFolder(folder.id);
      showToast({
        message: `Folder "${folder.name}" deleted successfully`,
        status: 'success',
      });
      loadFolders(isSuperAdmin ? selectedOrgId : userOrgId);
      if (currentFolderId === folder.id) {
        navigateToFolder(null, 'Home');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete folder';
      showToast({
        message: `Failed to delete folder: ${errorMessage}`,
        status: 'error',
      });
    }
  };

  const handleDeleteFile = async (file: FileNode) => {
    if (isResearchSystemRow(file)) {
      showToast({
        message: 'System-managed files cannot be deleted.',
        status: 'error',
      });
      return;
    }
    if (!confirm(`Delete file "${file.name}"?`)) return;
    try {
      const fileIdRaw = file.document_id ?? file.id;
      if (fileIdRaw === undefined || fileIdRaw === null || String(fileIdRaw).trim() === '') {
        throw new Error('Invalid file ID');
      }
      await saasApi.deleteFile(String(fileIdRaw));

      showToast({
        message: `File "${file.name}" deleted successfully`,
        status: 'success',
      });

      // Remove from selected documents in all conversations
      const allKeys = Object.keys(localStorage);
      allKeys.forEach((key) => {
        if (key.startsWith('persona_documents_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.documents && Array.isArray(data.documents)) {
              const filteredDocs = data.documents.filter(
                (doc: any) => String(doc.document_id) !== String(fileIdRaw),
              );
              if (filteredDocs.length !== data.documents.length) {
                // Document was removed, update localStorage
                if (filteredDocs.length === 0) {
                  localStorage.removeItem(key);
                } else {
                  localStorage.setItem(
                    key,
                    JSON.stringify({
                      documents: filteredDocs,
                      timestamp: Date.now(),
                    }),
                  );
                }
              }
            }
          } catch (e) {
            console.error('Error updating selected documents:', e);
          }
        }
      });

      // Dispatch event to notify other components
      window.dispatchEvent(new Event('documentsUpdated'));

      loadFolders(isSuperAdmin ? selectedOrgId : userOrgId);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete file';
      showToast({
        message: `Failed to delete file: ${errorMessage}`,
        status: 'error',
      });
    }
  };

  const handlePreviewFile = (file: FileNode) => {
    try {
      // Get base path from meta tag or default to /research/
      const basePath = import.meta.env.BASE_URL || '/research/';

      // Build the URL first
      let fileUrl: string;

      if (file.storage_key) {
        const storagePath = 'uploads';
        let filePath = file.storage_key;
        // Remove storage path prefix if present
        if (filePath.startsWith(storagePath + '/')) {
          filePath = filePath.substring(storagePath.length + 1);
        } else if (filePath.startsWith('/' + storagePath + '/')) {
          filePath = filePath.substring(storagePath.length + 2);
        }
        // Use full URL with base path to avoid React Router intercepting it
        fileUrl = `${window.location.origin}${basePath}static/resources/folder/file/${filePath}`;
      } else {
        // Fallback to file ID route with base path
        fileUrl = `${window.location.origin}${basePath}files/${file.id}?direct=true`;
      }

      // Try to open in parent window first (for iframe context), fallback to current window
      let newWindow: Window | null = null;

      try {
        // If we're in an iframe, try to use parent window
        if (window.parent && window.parent !== window) {
          newWindow = window.parent.open(fileUrl, '_blank');
        }
      } catch (e) {
        // Parent access blocked, will try current window
        console.log('Parent window access blocked, trying current window');
      }

      // If parent didn't work, try top window
      if (!newWindow) {
        try {
          if (window.top && window.top !== window) {
            newWindow = window.top.open(fileUrl, '_blank');
          }
        } catch (e) {
          // Top access blocked, will try current window
          console.log('Top window access blocked, trying current window');
        }
      }

      // If neither parent nor top worked, try current window
      if (!newWindow) {
        newWindow = window.open(fileUrl, '_blank');
      }

      if (!newWindow) {
        showToast({
          message: 'Please allow popups for this site to preview files',
          status: 'error',
        });
      }
    } catch (err: any) {
      console.error('Preview error:', err);
      showToast({
        message: err.message || 'Failed to preview file',
        status: 'error',
      });
    }
  };

  /** Fetch via presigned URL and trigger browser save dialog (avoids `window.open` / popup blockers). */
  const handleDownloadFile = async (file: FileNode) => {
    const docId = file.document_id ?? file.id;
    if (!docId) {
      showToast({ message: 'Missing document id', status: 'error' });
      return;
    }
    const orgId = isSuperAdmin ? selectedOrgId : userOrgId;
    try {
      await saasApi.downloadDocumentWithBrowser(String(docId), orgId, file.name);
    } catch (err: any) {
      showToast({
        message: err?.message || 'Failed to download file',
        status: 'error',
      });
    }
  };

  const hasFolderPermission = permissionManager?.canCreate('folders') || false;
  const hasFilePermission = permissionManager?.canCreate('files') || false;
  const hasFileUpdatePermission = permissionManager?.canUpdate('files') || false;
  const hasFileDeletePermission = permissionManager?.canDelete('files') || false;
  /** Show create/upload when admin, explicit RBAC, or any org membership (API still enforces writes). */
  const canManage =
    isSuperAdmin ||
    isOrgAdmin ||
    hasFolderPermission ||
    hasFilePermission ||
    Boolean(userOrgId);
  const canManageFiles =
    isSuperAdmin || isOrgAdmin || hasFileUpdatePermission || hasFileDeletePermission;

  const currentFolderNodeForUpload =
    currentFolderId ? findFolder(allFolders, currentFolderId) : null;
  const uploadBlockedInSystemFolder =
    Boolean(currentFolderNodeForUpload && isResearchSystemRow(currentFolderNodeForUpload));
  const canUploadDocuments = canManage && !uploadBlockedInSystemFolder;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Spinner size={48} className="mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading resources...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-fig-Surface-standard px-2 pb-2 pt-0">
      {/* Header - Responsive */}
      <div>
        <div className="flex flex-col gap-3">
          {/* First Row: Org selector (if super admin) */}
          {isSuperAdmin && organizations.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">
                Org:
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => {
                  const newOrgId = e.target.value;
                  setSelectedOrgId(newOrgId);
                  if (newOrgId) {
                    loadFolders(newOrgId);
                    navigateToFolder(null, 'Home');
                  }
                }}
                className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:text-gray-100 sm:min-w-[200px] sm:flex-none sm:px-3 sm:py-2 sm:text-sm md:min-w-[300px] lg:max-w-[500px]"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.legal_name ? `(${org.legal_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Second Row: Tabs + Actions */}
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            {/* Tabs */}
            <div className="flex items-center gap-[var(--Gap-group)] sm:gap-[var(--Gap-group)]">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('documents');
                  navigateToFolder(null, 'Home');
                  setShowSearch(false);
                }}
                className={cn(
                  'font-inter inline-flex items-center border-b-2 px-0 text-sm font-normal leading-5 transition-colors',
                  activeTab === 'documents'
                    ? 'border-fig-Stroke-primary py-[var(--Padding-spacer)] text-fig-Subject-standard'
                    : 'border-transparent py-[var(--Padding-spacer)] text-fig-Subject-neutral',
                )}
              >
                Documents
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('reports');
                  setSearchQuery('');
                  setShowSearch(false);
                }}
                className={cn(
                  'font-inter inline-flex items-center border-b-2 px-0 text-sm font-normal leading-5 transition-colors',
                  activeTab === 'reports'
                    ? 'border-fig-Stroke-primary py-[var(--Padding-spacer)] text-fig-Subject-standard'
                    : 'border-transparent py-[var(--Padding-spacer)] text-fig-Subject-neutral',
                )}
              >
                Reports
              </button>
            </div>

            {/* Action Buttons */}
            {canManage && (
              <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:flex-nowrap">
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateFolderModal(true);
                    }}
                    className={cn(
                      'flex h-[var(--Size-zero-button)] flex-1 items-center justify-center gap-0.5 rounded-[2px] border border-fig-Stroke-primary',
                      'bg-fig-Surface-two-primary px-[var(--Dimensions-Size-xs3)] py-px',
                      'font-inter text-xs font-normal leading-4 text-fig-Subject-two-primary',
                      'transition-opacity hover:opacity-90',
                      'hover:!border-fig-Stroke-primary hover:!bg-fig-Surface-two-primary hover:!text-fig-Subject-two-primary',
                      'sm:flex-none',
                    )}
                  >
                    <Plus className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Create folder</span>
                    <span className="sm:hidden">Folder</span>
                  </button>
                  {canUploadDocuments && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadFileModal(true);
                      }}
                      className={cn(
                        'flex h-[var(--Size-zero-button)] flex-1 items-center justify-center gap-[var(--Gap-one-buddy)] rounded-[2px] border border-fig-Stroke-standard',
                        'bg-transparent px-[var(--Dimensions-Size-xs3)] py-px',
                        'font-inter text-xs font-normal leading-4 text-fig-Subject-standard',
                        'transition-colors',
                        'hover:!border-fig-Stroke-standard hover:!bg-fig-Surface-one-standard hover:!text-fig-Subject-standard',
                        'sm:flex-none',
                      )}
                    >
                      <svg
                        width="16"
                        height="14"
                        viewBox="0 0 16 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] shrink-0 pr-[var(--Gap-one-buddy)] text-fig-Subject-standard"
                        aria-hidden="true"
                      >
                        <path
                          d="M1.2 12.2885H14.8V7.78568H16V13.534H0V7.78568H1.2V12.2885Z"
                          fill="currentColor"
                        />
                        <path
                          d="M11.4688 4.1497L10.6188 5.02869L8.6 2.92365V10.0813H7.4V2.92528L5.38125 5.02869L4.53125 4.1497L8.00078 0.533997L11.4688 4.1497Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="hidden sm:inline">Upload document</span>
                      <span className="sm:hidden">Upload</span>
                    </button>
                  )}
                </div>
                {showSearch ? (
                  <div className="relative min-w-0 sm:min-w-[16rem]">
                    <div
                      className={cn(
                        'flex h-[var(--Size-zero-button)] w-full min-w-0 max-w-md items-stretch border-fig-Stroke-soft bg-fig-Surface-standard',
                        'overflow-hidden rounded-[2px] border transition-[border-color,box-shadow] duration-200',
                        'focus-within:ring-fig-Stroke-primary/20 focus-within:border-fig-Stroke-primary focus-within:ring-2',
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1 pl-1.5 pr-1">
                        <Search
                          className="h-3.5 w-3.5 shrink-0 text-fig-Subject-standard"
                          aria-hidden
                        />
                        <input
                          id="resources-search"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search files and folders..."
                          className={cn(
                            'm-0 min-w-0 flex-1 border-0 bg-transparent p-0',
                            'text-fig-Text-body caret-fig-Text-body placeholder:text-fig-Subject-soft',
                            'text-xs font-normal leading-4',
                            'focus-visible:outline-none',
                          )}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setShowSearch(false);
                              setSearchQuery('');
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowSearch(false);
                            setSearchQuery('');
                          }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-fig-Subject-standard transition-opacity hover:text-fig-Text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fig-Stroke-soft"
                          title="Close search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSearch(true);
                    }}
                    className={cn(
                      'flex h-[var(--Size-zero-button)] w-[var(--Size-zero-button)] shrink-0 items-center justify-center text-fig-Subject-standard',
                      'rounded-[2px] p-0 transition-colors',
                      'hover:bg-fig-Surface-one-standard hover:text-fig-Text-body',
                    )}
                    title="Search files and folders"
                    aria-label="Search files and folders"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breadcrumbs — mt-2 = 8px gap under header; inner pt-0 replaces former py-* top padding */}
      <div>
        <div className="pb-[var(--Gap-parentChild)] pt-[var(--Gap-parentChild)]">
          {/* Breadcrumbs - only show for Documents tab */}
          {activeTab === 'documents' ? (
            <div className="flex items-center gap-2 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.id || 'home'} className="flex items-center gap-2">
                  {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <button
                    onClick={() => navigateToFolder(crumb.id, crumb.name)}
                    className={`rounded px-2 py-1 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${
                      index === breadcrumbs.length - 1 ? 'font-semibold' : ''
                    }`}
                  >
                    {index === 0 ? <Home className="mr-1 inline h-4 w-4" /> : null}
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Content View */}
      <div className="flex-1 overflow-auto">

        {filteredContent.folders.length === 0 && filteredContent.files.length === 0 ? (
          <div className="py-12 text-center">
            <img
              src="/research/assets/Folder.svg"
              alt="Empty Folder"
              className="mx-auto mb-4 h-12 w-12 opacity-40 dark:invert"
            />
            <p className="mb-4 text-fig-Subject-standard">This folder is empty</p>
          </div>
        ) : (
          /* List/Table View - Responsive */
          <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[640px]">
              <thead className="bg-fig-Surface-one-neutral dark:bg-fig-Surface-one-neutral">
                <tr>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                      'hidden md:table-cell',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Owner
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-right align-middle',
                      'hidden sm:table-cell',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Date created
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-right align-middle',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="">
                {/* Folders */}
                {filteredContent.folders.map((folder, folderIndex) => {
                  const folderFileCount = folder.files?.length || 0;
                  const currentUserId = userInfo?.user_id || userInfo?.id;

                  const isSystemFolder = isResearchSystemRow(folder);
                  const canModifyFolder =
                    !isSystemFolder &&
                    (isSuperAdmin ||
                      isOrgAdmin ||
                      sameCreatorAsCurrentUser(folder.created_by, currentUserId));

                  const canRenameFolder =
                    canModifyFolder &&
                    !researchRenameLocked(folder) &&
                    !isResearchDefaultUploadFolder(folder);
                  return (
                    <tr
                      key={folder.id}
                      className={cn(
                        'group cursor-pointer',
                        'hover:bg-fig-Surface-neutral',
                        folderIndex % 2 === 0
                          ? 'bg-fig-Surface-standard'
                          : 'bg-fig-Surface-zero-neutral',
                      )}
                      onDoubleClick={(e) => {
                        if (
                          !(e.target as HTMLElement).closest('.dropdown-trigger, .dropdown-menu')
                        ) {
                          navigateToFolder(folder.id, folder.name);
                        }
                      }}
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
                              'box-border flex h-[var(--Size-zero-button)] w-[var(--Size-zero-button)] shrink-0 items-center justify-center rounded-none p-1',
                              folderIndex % 2 === 0
                                ? 'bg-fig-Surface-neutral'
                                : 'bg-fig-Surface-one-neutral',
                            )}
                          >
                            <img
                              src="/research/assets/Folder.svg"
                              alt="Folder"
                              className="block h-5 w-5 flex-shrink-0 object-contain dark:invert"
                            />
                          </div>
                          <div className="flex min-w-0 flex-col gap-0">
                            <div className="fy-typography-title-small truncate text-fig-Subject-standard">
                              {folder.name}
                            </div>
                            <div className="fy-typography-body-tiny text-fig-Subject-neutral">
                              {folderFileCount} Doc{folderFileCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        className={cn(
                          'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)]',
                          'font-inter',
                          'hidden p-[var(--Padding-spacer)] text-left align-middle text-sm font-normal leading-5 text-fig-Subject-standard md:table-cell',
                        )}
                      >
                        {researchOwnerColumnLabel(folder)}
                      </td>
                      <td
                        className={cn(
                          'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)]',
                          'font-inter',
                          'hidden p-[var(--Padding-spacer)] text-right align-middle text-sm font-normal leading-5 text-fig-Subject-standard sm:table-cell',
                        )}
                      >
                        {formatDate(folder.created_at)}
                      </td>
                      <td
                        className={cn(
                          'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] text-right align-middle',
                          'font-inter text-sm font-medium leading-5',
                        )}
                      >
                        <div className="flex h-full min-h-0 items-center justify-end gap-2">
                          {canModifyFolder && (
                            <div className="relative">
                              <button
                                ref={(el) => {
                                  if (el) {
                                    buttonRefs.current.set(`folder-${folder.id}`, el);
                                  } else {
                                    buttonRefs.current.delete(`folder-${folder.id}`);
                                  }
                                }}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const isCurrentlySelected =
                                    selectedItem?.type === 'folder' &&
                                    selectedItem.id === folder.id;
                                  if (isCurrentlySelected) {
                                    setSelectedItem(null);
                                    setDropdownPosition(null);
                                  } else {
                                    const button = buttonRefs.current.get(`folder-${folder.id}`);
                                    if (button) {
                                      const rect = button.getBoundingClientRect();
                                      setDropdownPosition({
                                        top: rect.bottom + 4, // Position below button
                                        right: window.innerWidth - rect.right,
                                      });
                                    }
                                    setSelectedItem({ type: 'folder', id: folder.id });
                                  }
                                }}
                                className="dropdown-trigger rounded-[2px] p-1 text-fig-Subject-standard transition-colors hover:bg-fig-Surface-one-standard"
                                title="More options"
                              >
                                <MoreVertical className="h-3 w-3" aria-hidden />
                              </button>
                              {selectedItem?.type === 'folder' &&
                                selectedItem.id === folder.id &&
                                dropdownPosition &&
                                createPortal(
                                  <div
                                    className="fixed z-[9999] w-48 rounded-[2px] border border-fig-Stroke-soft bg-fig-Surface-standard shadow-lg"
                                    style={{
                                      top: `${dropdownPosition.top}px`,
                                      right: `${dropdownPosition.right}px`,
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="py-1">
                                      {canRenameFolder && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            // Set the folder to edit directly
                                            setFolderToEdit(folder);
                                            setShowEditFolderModal(true);
                                            setSelectedItem(null);
                                            setDropdownPosition(null);
                                          }}
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-fig-Subject-standard hover:bg-fig-Surface-one-standard"
                                        >
                                          <img
                                            src="/research/assets/edit.svg"
                                            alt="Edit"
                                            className="h-3.5 w-3.5 opacity-70 dark:opacity-70 dark:brightness-0 dark:invert"
                                          />
                                          Rename
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          handleDeleteFolder(folder);
                                          setSelectedItem(null);
                                          setDropdownPosition(null);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-destructive hover:bg-fig-Surface-one-standard"
                                      >
                                        <img
                                          src="/research/assets/delete.svg"
                                          alt="Delete"
                                          className="h-3.5 w-3.5 opacity-70 dark:opacity-70 dark:brightness-0 dark:invert"
                                        />
                                        Delete
                                      </button>
                                    </div>
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Files */}
                {filteredContent.files.map((file, fileIndex) => {
                  const FileIcon = getFileIcon(file.extension);
                  const currentUserId = userInfo?.user_id || userInfo?.id;

                  const currentFolderObj = findFolder(allFolders, currentFolderId);
                  const inSystemFolder = Boolean(
                    currentFolderObj && isResearchSystemRow(currentFolderObj),
                  );

                  const isSystemFile = isResearchSystemRow(file);
                  const canModifyFile =
                    !isSystemFile &&
                    (inSystemFolder
                      ? isSuperAdmin
                      : isSuperAdmin ||
                        isOrgAdmin ||
                        sameCreatorAsCurrentUser(file.created_by, currentUserId));
                  const rowIndex = filteredContent.folders.length + fileIndex;
                  return (
                    <tr
                      key={file.id}
                      className={cn(
                        'group',
                        'hover:bg-fig-Surface-neutral',
                        rowIndex % 2 === 0
                          ? 'bg-fig-Surface-standard'
                          : 'bg-fig-Surface-zero-neutral',
                      )}
                    >
                      <td
                        className={cn(
                          'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                          'border-r border-fig-Stroke-soft',
                          'overflow-hidden',
                        )}
                      >
                        <div className="flex h-full min-w-0 items-center gap-2 sm:gap-[var(--Gap-neighbor)]">
                          <div
                            className={cn(
                              'box-border flex h-[var(--Size-zero-button)] w-[var(--Size-zero-button)] shrink-0 items-center justify-center rounded-[2px] p-1',
                              rowIndex % 2 === 0
                                ? 'bg-fig-Surface-neutral'
                                : 'bg-fig-Surface-one-neutral',
                            )}
                            aria-hidden
                          >
                            <FileIcon className="block h-5 w-5 flex-shrink-0 object-contain" />
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadFile(file);
                            }}
                            className="font-inter min-w-0 max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm font-medium leading-4 text-blue-600 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-400"
                            title={`Download ${file.name}`}
                          >
                            {file.name}
                          </button>
                        </div>
                      </td>
                      <td
                        className={cn(
                          'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)]',
                          'font-inter',
                          'hidden p-[var(--Padding-spacer)] text-left align-middle text-sm font-normal leading-5 text-fig-Subject-standard md:table-cell',
                        )}
                      >
                        {researchOwnerColumnLabel(file)}
                      </td>
                      <td
                        className={cn(
                          'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)]',
                          'font-inter',
                          'hidden p-[var(--Padding-spacer)] text-right align-middle text-sm font-normal leading-5 text-fig-Subject-standard sm:table-cell',
                        )}
                      >
                        {formatDate(file.created_at)}
                      </td>
                      <td
                        className={cn(
                          'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] text-right align-middle',
                          'font-inter text-sm font-medium leading-5',
                        )}
                      >
                        <div className="flex h-full min-h-0 items-center justify-end gap-2">
                          {/* <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewFile(file);
                            }}
                            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </button> */}
                          {canModifyFile && (
                            <div className="relative">
                              <button
                                ref={(el) => {
                                  if (el) {
                                    buttonRefs.current.set(`file-${file.id}`, el);
                                  } else {
                                    buttonRefs.current.delete(`file-${file.id}`);
                                  }
                                }}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const isCurrentlySelected =
                                    selectedItem?.type === 'file' && selectedItem.id === file.id;
                                  if (isCurrentlySelected) {
                                    setSelectedItem(null);
                                    setDropdownPosition(null);
                                  } else {
                                    const button = buttonRefs.current.get(`file-${file.id}`);
                                    if (button) {
                                      const rect = button.getBoundingClientRect();
                                      setDropdownPosition({
                                        top: rect.bottom + 4,
                                        right: window.innerWidth - rect.right,
                                      });
                                    }
                                    setSelectedItem({ type: 'file', id: file.id });
                                  }
                                }}
                                className="dropdown-trigger rounded-[2px] p-1 text-fig-Subject-standard transition-colors hover:bg-fig-Surface-one-standard"
                                title="More options"
                              >
                                <MoreVertical className="h-3 w-3" aria-hidden />
                              </button>
                              {selectedItem?.type === 'file' &&
                                selectedItem.id === file.id &&
                                dropdownPosition &&
                                createPortal(
                                  <div
                                    className="fixed z-[9999] w-48 rounded-[2px] border border-fig-Stroke-soft bg-fig-Surface-standard shadow-lg"
                                    style={{
                                      top: `${dropdownPosition.top}px`,
                                      right: `${dropdownPosition.right}px`,
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="py-1">
                                      {/* Rename option removed - users cannot rename documents */}
                                      {canModifyFile && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleDeleteFile(file);
                                            setSelectedItem(null);
                                            setDropdownPosition(null);
                                          }}
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-destructive hover:bg-fig-Surface-one-standard"
                                        >
                                          <img
                                            src="/research/assets/delete.svg"
                                            alt="Delete"
                                            className="h-4 w-4 opacity-70 dark:opacity-70 dark:invert"
                                          />
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          )}
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

      {/* Modals */}
      {showCreateFolderModal && (
        <CreateFolderModal
          parentId={currentFolderId || undefined}
          orgId={isSuperAdmin ? selectedOrgId : userOrgId}
          isSuperAdmin={isSuperAdmin}
          folders={allFolders}
          onClose={() => setShowCreateFolderModal(false)}
          onSuccess={async () => {
            setShowCreateFolderModal(false);
            // Reload folders to show the newly created folder
            await loadFolders(isSuperAdmin ? selectedOrgId : userOrgId);
          }}
        />
      )}

      {showEditFolderModal && folderToEdit && (
        <EditFolderModal
          folder={folderToEdit}
          onClose={() => {
            setShowEditFolderModal(false);
            setFolderToEdit(null);
            setSelectedItem(null);
          }}
          onSuccess={() => {
            setShowEditFolderModal(false);
            setFolderToEdit(null);
            setSelectedItem(null);
            // Reload folders to get updated names
            loadFolders(isSuperAdmin ? selectedOrgId : userOrgId);
          }}
        />
      )}

      {showUploadFileModal && (
        <UploadFileModal
          folderId={currentFolderId || undefined}
          orgId={isSuperAdmin ? selectedOrgId : userOrgId}
          folders={allFolders}
          isSuperAdmin={isSuperAdmin}
          isOrgAdmin={isOrgAdmin}
          currentUserId={(userInfo?.user_id || userInfo?.id)?.toString()}
          onClose={() => setShowUploadFileModal(false)}
          onSuccess={async () => {
            setShowUploadFileModal(false);
            // Reload folders to show newly uploaded files
            await loadFolders(isSuperAdmin ? selectedOrgId : userOrgId);
          }}
        />
      )}

      {showEditFileModal && (
        <EditFileModal
          file={(() => {
            if (selectedItem?.type === 'file') {
              // Find file in current folder
              const foundFile = filteredContent.files.find((f) => f.id === selectedItem.id);
              return foundFile || { id: String(selectedItem.id), name: '' };
            }
            // Fallback - try to find by stored file ID
            const storedFileId = localStorage.getItem('editing_file_id');
            if (storedFileId) {
              const foundFile = filteredContent.files.find((f) => String(f.id) === storedFileId);
              localStorage.removeItem('editing_file_id');
              return foundFile || { id: storedFileId, name: '' };
            }
            return { id: '', name: '' };
          })()}
          onClose={() => {
            setShowEditFileModal(false);
            setSelectedItem(null);
            localStorage.removeItem('editing_file_id');
          }}
          onSuccess={() => {
            setShowEditFileModal(false);
            setSelectedItem(null);
            localStorage.removeItem('editing_file_id');
            // Reload folders to get updated file names
            loadFolders(isSuperAdmin ? selectedOrgId : userOrgId);
          }}
        />
      )}
    </div>
  );
}
