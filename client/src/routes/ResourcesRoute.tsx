import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, useToastContext } from '@librechat/client';
import { saasApi } from '~/services/saasApi';
import { PermissionManager } from '~/utils/permissions';
import { 
  File, Plus, Trash2, Edit, ChevronRight, Home, 
  Eye, List, MoreVertical, Search, X
} from 'lucide-react';
import CreateFolderModal from '~/components/Resources/Modals/CreateFolderModal';
import EditFolderModal from '~/components/Resources/Modals/EditFolderModal';
import UploadFileModal from '~/components/Resources/Modals/UploadFileModal';
import EditFileModal from '~/components/Resources/Modals/EditFileModal';

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
  id: string; // Legacy UUID for compatibility
  document_id?: number; // Actual document ID for deletion/updates
  name: string;
  extension?: string;
  size_bytes?: number;
  created_at: string;
  storage_key?: string;
  created_by?: string;
  created_by_name?: string;
}

// Custom document icon component for list view
const DocumentIcon = ({ className }: { className?: string }) => (
  <img 
    src="/assets/documents.svg" 
    alt="Document" 
    className={`${className || 'h-4 w-4'} opacity-70 dark:brightness-0 dark:invert dark:opacity-70`}
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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'Home' }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<{ type: 'folder' | 'file'; id: string | number } | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);
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
  const userOrgId = userInfo?.org_id || null;
  const isOrgAdmin = userInfo?.org_role === 'admin';

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
          const resources = ['organizations', 'users', 'roles', 'permissions', 'folders', 'files', 'documents'];
          const actions = ['read', 'create', 'update', 'delete'];
          
          permissions = resources.flatMap((resource: string) =>
            actions.map((action: string) => ({
              id: `${resource}-${action}`,
              resource,
              action,
            }))
          );
          
          console.log('🔑 ResourcesRoute - Superadmin detected - granting all permissions:', permissions.length);
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
          setLoading(false);
          return;
        }
        const targetOrgId = orgId || selectedOrgId;
        if (!targetOrgId) {
          if (organizations.length > 0) {
            setError('Please select an organization to view its resources.');
          }
          setAllFolders([]);
          setLoading(false);
          return;
        }
        const data = await saasApi.getFolderTree(targetOrgId);
        setAllFolders(Array.isArray(data) ? data : []);
        return;
      }
      
      const targetOrgId = orgId || userOrgId;
      if (!targetOrgId) {
        setError('Organization ID is required.');
        setAllFolders([]);
        setLoading(false);
        return;
      }
      
      const data = await saasApi.getFolderTree(targetOrgId);
      setAllFolders(Array.isArray(data) ? data : []);
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

  // Find Reports folder
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
    // Backend now filters folders by user_id, so we don't need client-side user filtering
    // We only need to filter out the Reports folder from the Documents tab

    // If Reports tab is active, show Reports folder content
    if (activeTab === 'reports') {
      const reportsFolder = findReportsFolder(allFolders);
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
    
    if (!currentFolderId) {
      // Root level - return all root folders except Reports
      // Backend already filters by user_id, so we only show what the user has access to
      const rootFolders = allFolders.filter(f => !f.parent_id && f.id !== reportsFolderId);
      return {
        folders: rootFolders,
        files: [],
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
  }, [currentFolderId, allFolders, activeTab]);

  // Filter folders and files based on search query
  const filteredContent = useMemo(() => {
    if (!searchQuery.trim()) {
      return currentFolder;
    }
    const query = searchQuery.toLowerCase();
    return {
      folders: currentFolder.folders.filter(f => f.name.toLowerCase().includes(query)),
      files: currentFolder.files.filter(f => f.name.toLowerCase().includes(query)),
    };
  }, [currentFolder, searchQuery]);

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setBreadcrumbs([{ id: null, name: 'Home' }]);
    } else {
      // Build breadcrumbs by finding path to folder
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
    setSelectedItem(null);
  };

  const handleDeleteFolder = async (folder: FolderNode) => {
    const folderNameLower = folder.name.toLowerCase();
    const isFyersResources = folderNameLower === 'fyers resources';
    const isResources = folderNameLower === 'resources';
    
    // Users can delete Fyers Resources folder but cannot rename it
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
    if (!confirm(`Delete file "${file.name}"?`)) return;
    try {
      // Use document_id if available, otherwise fall back to id (for backward compatibility)
      const fileId = file.document_id || parseInt(file.id);
      if (isNaN(fileId)) {
        throw new Error('Invalid file ID');
      }
      await saasApi.deleteFile(fileId);
      
      showToast({
        message: `File "${file.name}" deleted successfully`,
        status: 'success',
      });
      
      // Remove from selected documents in all conversations
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (key.startsWith('persona_documents_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.documents && Array.isArray(data.documents)) {
              const filteredDocs = data.documents.filter((doc: any) => doc.document_id !== fileId);
              if (filteredDocs.length !== data.documents.length) {
                // Document was removed, update localStorage
                if (filteredDocs.length === 0) {
                  localStorage.removeItem(key);
                } else {
                  localStorage.setItem(key, JSON.stringify({
                    documents: filteredDocs,
                    timestamp: Date.now(),
                  }));
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


  const handlePreviewFile = async (file: FileNode) => {
    try {
      // Use static route if storage_key is available, otherwise fallback to file ID route
      if (file.storage_key) {
        const storagePath = 'uploads';
        let filePath = file.storage_key;
        // Remove storage path prefix if present
        if (filePath.startsWith(storagePath + '/')) {
          filePath = filePath.substring(storagePath.length + 1);
        } else if (filePath.startsWith('/' + storagePath + '/')) {
          filePath = filePath.substring(storagePath.length + 2);
        }
        // Use full URL to avoid React Router intercepting it
        // Authentication handled by cookies/Authorization header
        const staticUrl = `${window.location.origin}/static/resources/folder/file/${filePath}`;
        window.open(staticUrl, '_blank');
      } else {
        // Fallback to file ID route
        const fileUrl = `${window.location.origin}/files/${file.id}?direct=true`;
        window.open(fileUrl, '_blank');
      }
    } catch (err: any) {
      console.error('Preview error:', err);
      alert(err.message || 'Failed to preview file');
    }
  };

  const hasFolderPermission = permissionManager?.canCreate('folders') || false;
  const hasFilePermission = permissionManager?.canCreate('files') || false;
  const hasFileUpdatePermission = permissionManager?.canUpdate('files') || false;
  const hasFileDeletePermission = permissionManager?.canDelete('files') || false;
  const canManage = isSuperAdmin || isOrgAdmin || hasFolderPermission || hasFilePermission;
  const canManageFiles = isSuperAdmin || isOrgAdmin || hasFileUpdatePermission || hasFileDeletePermission;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading resources...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header - Responsive */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-3 sm:py-4">
        <div className="flex flex-col gap-3">
          {/* First Row: Org selector (if super admin) */}
          {isSuperAdmin && organizations.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
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
                className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 flex-1 sm:flex-none sm:min-w-[200px] md:min-w-[300px] lg:max-w-[500px]"
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                onClick={() => {
                  setActiveTab('documents');
                  navigateToFolder(null, 'Home');
                  setShowSearch(false);
                }}
                className={`px-0 py-3 text-[14px] leading-[20px] font-normal transition-colors border-b-2 ${
                  activeTab === 'documents'
                    ? 'text-[#2A2A2A] dark:text-gray-100 border-[#2434E7]'
                    : 'text-[#6D6D6D] dark:text-gray-400 hover:text-[#2A2A2A] dark:hover:text-gray-200 border-transparent'
                }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Documents
              </button>
              <button
                onClick={() => {
                  setActiveTab('reports');
                  setSearchQuery('');
                  setShowSearch(false);
                }}
                className={`px-0 py-3 text-[14px] leading-[20px] font-normal transition-colors border-b-2 ${
                  activeTab === 'reports'
                    ? 'text-[#2A2A2A] dark:text-gray-100 border-[#2434E7]'
                    : 'text-[#6D6D6D] dark:text-gray-400 hover:text-[#2A2A2A] dark:hover:text-gray-200 border-transparent'
                }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Reports
              </button>
            </div>
            
            {/* Action Buttons */}
            {canManage && (
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <button
                  onClick={() => {
                    setShowCreateFolderModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none"
                >
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Create folder</span>
                  <span className="sm:hidden">Folder</span>
                </button>
                <button
                  onClick={() => {
                    setShowUploadFileModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none"
                >
                  <img src="/assets/export.svg" alt="Upload" className="h-3 w-3 sm:h-3.5 sm:w-3.5 dark:invert" />
                  <span className="hidden sm:inline">Upload document</span>
                  <span className="sm:hidden">Upload</span>
                </button>
                {showSearch ? (
                  <div className="relative">
                    <input
                      id="resources-search"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search files and folders..."
                      className="pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-64"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowSearch(false);
                          setSearchQuery('');
                        }
                      }}
                    />
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <button
                      onClick={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      title="Close search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setShowSearch(true);
                    }}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Search files and folders"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breadcrumbs - Responsive */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-3 py-2 sm:py-3">
          {/* Breadcrumbs - only show for Documents tab */}
          {activeTab === 'documents' ? (
            <div className="flex items-center gap-2 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.id || 'home'} className="flex items-center gap-2">
                  {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <button
                    onClick={() => navigateToFolder(crumb.id, crumb.name)}
                    className={`px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 ${
                      index === breadcrumbs.length - 1 ? 'font-semibold' : ''
                    }`}
                  >
                    {index === 0 ? <Home className="h-4 w-4 inline mr-1" /> : null}
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Content View */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 m-6 text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {filteredContent.folders.length === 0 && filteredContent.files.length === 0 ? (
          <div className="text-center py-12">
            <img src="/assets/Folder.svg" alt="Empty Folder" className="h-12 w-12 mx-auto mb-4 opacity-40 dark:invert" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">This folder is empty</p>
          </div>
        ) : (
          /* List/Table View - Responsive */
          <div className="bg-white dark:bg-gray-800 overflow-x-auto mb-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </th>
                  <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:table-cell">Owner</th>
                  <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:table-cell">Created date</th>
                  <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {/* Folders */}
                {filteredContent.folders.map((folder) => {
                  const folderFileCount = folder.files?.length || 0;
                  const folderNameLower = folder.name.toLowerCase();
                  const isFyersResources = folderNameLower === 'fyers resources';
                  const isResources = folderNameLower === 'resources';
                  const currentUserId = userInfo?.user_id || userInfo?.id;
                  
                  // FYERS Resources folder restrictions:
                  // - Only super admin can rename/delete FYERS Resources folder
                  // Resources folder (for user uploads) can be deleted by users when empty
                  // Other folders follow normal permissions
                  const canModifyFolder = isFyersResources
                    ? isSuperAdmin // Only super admin can modify FYERS Resources
                    : isSuperAdmin || isOrgAdmin || folder.created_by === currentUserId; // Others follow normal rules
                  
                  // Check if folder can be renamed
                  // - FYERS Resources: only superadmin can rename
                  // - Resources: users cannot rename (it's the default folder)
                  const canRenameFolder = isFyersResources 
                    ? isSuperAdmin // Only super admin can rename FYERS Resources
                    : !isResources && canModifyFolder; // Resources folder cannot be renamed by anyone
                  return (
                    <tr
                      key={folder.id}
                      className="group hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onDoubleClick={(e) => {
                        if (!(e.target as HTMLElement).closest('.dropdown-trigger, .dropdown-menu')) {
                          navigateToFolder(folder.id, folder.name);
                        }
                      }}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <img src="/assets/Folder.svg" alt="Folder" className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 dark:invert" />
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{folder.name}</div>
                            {folderFileCount > 0 && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">{folderFileCount} doc{folderFileCount !== 1 ? 's' : ''}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                        {folder.created_by_name || 'Unknown'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {formatDate(folder.created_at)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
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
                                  const isCurrentlySelected = selectedItem?.type === 'folder' && selectedItem.id === folder.id;
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
                                className="dropdown-trigger p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="More options"
                              >
                                <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              </button>
                              {selectedItem?.type === 'folder' && selectedItem.id === folder.id && dropdownPosition && createPortal(
                                <div 
                                  className="fixed w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-[9999]"
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
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                      <img 
                                        src="/assets/edit.svg" 
                                        alt="Edit" 
                                        className="h-3.5 w-3.5 opacity-70 dark:brightness-0 dark:invert dark:opacity-70" 
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
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                      <img 
                                        src="/assets/delete.svg" 
                                        alt="Delete" 
                                        className="h-3.5 w-3.5 opacity-70 dark:brightness-0 dark:invert dark:opacity-70" 
                                      />
                                      Delete
                                    </button>
                                  </div>
                                </div>,
                                document.body
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Files */}
                {filteredContent.files.map((file) => {
                  const FileIcon = getFileIcon(file.extension);
                  const currentUserId = userInfo?.user_id || userInfo?.id;
                  
                  // File modification permissions:
                  // - Files in "FYERS Resources": only super admin can delete
                  // - Files in other folders: super admin, org admins, or file creator can delete
                  const currentFolderObj = findFolder(allFolders, currentFolderId);
                  const currentFolderNameLower = currentFolderObj?.name.toLowerCase() || '';
                  const isInFyersResources = currentFolderNameLower === 'fyers resources';
                  
                  const canModifyFile = isInFyersResources
                    ? isSuperAdmin // Only super admin can delete files in FYERS Resources
                    : (isSuperAdmin || isOrgAdmin || file.created_by === currentUserId); // Normal rules for other folders
                  return (
                    <tr
                      key={file.id}
                      className="group hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onDoubleClick={() => handlePreviewFile(file)}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <FileIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" />
                          <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                        {file.created_by_name || 'Unknown'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {formatDate(file.created_at)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
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
                                  const isCurrentlySelected = selectedItem?.type === 'file' && selectedItem.id === file.id;
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
                                className="dropdown-trigger p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="More options"
                              >
                                <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              </button>
                              {selectedItem?.type === 'file' && selectedItem.id === file.id && dropdownPosition && createPortal(
                                <div 
                                  className="fixed w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-[9999]"
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
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      >
                                        <img 
                                          src="/assets/delete.svg" 
                                          alt="Delete" 
                                          className="h-4 w-4 opacity-70 dark:invert dark:opacity-70" 
                                        />
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </div>,
                                document.body
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
              const foundFile = filteredContent.files.find(f => f.id === selectedItem.id);
              return foundFile || { id: String(selectedItem.id), name: '' };
            }
            // Fallback - try to find by stored file ID
            const storedFileId = localStorage.getItem('editing_file_id');
            if (storedFileId) {
              const foundFile = filteredContent.files.find(f => String(f.id) === storedFileId);
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
