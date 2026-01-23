import { useState, useRef, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@librechat/client';
import { Button } from '@librechat/client';
import { useToastContext, DropdownPopup } from '@librechat/client';
import { uploadDocument } from '~/data-provider/document-service';
import { saasApi } from '~/services/saasApi';
import { File as FileIcon, ChevronDown } from 'lucide-react';

interface UploadFileModalProps {
  folderId?: string;
  orgId?: string | null;
  folders?: any[]; // Folder tree for selection
  isSuperAdmin?: boolean;
  isOrgAdmin?: boolean;
  currentUserId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FlatFolder {
  id: string;
  name: string;
  path: string;
  level: number;
  created_by?: string;
}

// Placeholder ID for Resources folder when it doesn't exist yet
const RESOURCES_PLACEHOLDER_ID = 'resources-placeholder';

export default function UploadFileModal({ folderId, orgId, folders = [], isSuperAdmin = false, isOrgAdmin: isOrgAdminProp, currentUserId: currentUserIdProp, onClose, onSuccess }: UploadFileModalProps) {
  const { showToast } = useToastContext();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(folderId || '');
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use props if provided, otherwise get from localStorage
  const userInfoStr = localStorage.getItem('userInfo');
  const userInfo = userInfoStr ? JSON.parse(userInfoStr) : null;
  const currentUserId = currentUserIdProp || (userInfo?.user_id || userInfo?.id)?.toString();
  const isOrgAdmin = isOrgAdminProp !== undefined ? isOrgAdminProp : (userInfo?.org_role === 'admin');

  // Flatten folder tree for dropdown
  const flattenFolders = (folderNodes: any[], level = 0, parentFolder?: any): FlatFolder[] => {
    let result: FlatFolder[] = [];
    folderNodes.forEach((folder) => {
      result.push({
        id: folder.id,
        name: folder.name,
        path: folder.path || folder.name,
        level,
        created_by: folder.created_by,
      });
      if (folder.children && folder.children.length > 0) {
        result = result.concat(flattenFolders(folder.children, level + 1, folder));
      }
    });
    return result;
  };

  const flatFolders = flattenFolders(folders);

  // Filter folders for upload dropdown:
  // Backend already filters by user_id, we only need to:
  // 1. Filter out "Reports" folder
  // 2. Filter out "FYERS Resources" for non-super-admins
  const filteredFolders = flatFolders.filter(
    (folder: any) => {
      const nameLower = folder.name.toLowerCase();
      
      // Always filter out "Reports" folder
      if (nameLower === 'reports') return false;
      
      // Show "FYERS Resources" only for super admin
      if (nameLower === 'fyers resources') {
        return isSuperAdmin;
      }
      
      // Show all other folders (backend already filtered by user access)
      return true;
    }
  );

  // Find the "Resources" folder to set as default (NOT "FYERS Resources")
  const resourcesFolder = filteredFolders.find(
    (folder) => folder.name.toLowerCase() === 'resources'
  );

  // Find "FYERS Resources" folder (for superadmins)
  const fyersResourcesFolder = filteredFolders.find(
    (folder) => folder.name.toLowerCase() === 'fyers resources'
  );

  // Always ensure "Resources" folder appears in the list for non-superadmins, even if it doesn't exist yet
  // The backend will auto-create it when documents are uploaded
  let foldersWithResources = [...filteredFolders];
  
  if (!resourcesFolder && !isSuperAdmin) {
    // Add Resources placeholder for org admins and regular users if it doesn't exist
    foldersWithResources.unshift({
      id: RESOURCES_PLACEHOLDER_ID,
      name: 'Resources',
      path: 'Resources',
      level: 0,
      created_by: currentUserId,
    });
  }

  // Sort folders to put default folder first based on user role
  const sortedFolders = [...foldersWithResources].sort((a, b) => {
    const aNameLower = a.name.toLowerCase();
    const bNameLower = b.name.toLowerCase();
    
    if (isSuperAdmin) {
      // For superadmins, prioritize "FYERS Resources"
      if (aNameLower === 'fyers resources') return -1;
      if (bNameLower === 'fyers resources') return 1;
    } else {
      // For non-superadmins, prioritize "Resources"
      if (aNameLower === 'resources') return -1;
      if (bNameLower === 'resources') return 1;
    }
    
    return 0;
  });

  useEffect(() => {
    if (folderId) {
      setSelectedFolderId(folderId);
      const folder = sortedFolders.find(f => f.id === folderId);
      if (folder) {
        setSelectedFolderName(folder.name);
      }
    } else if (isSuperAdmin && fyersResourcesFolder) {
      // Superadmins default to "FYERS Resources"
      setSelectedFolderId(fyersResourcesFolder.id);
      setSelectedFolderName(fyersResourcesFolder.name);
    } else if (!isSuperAdmin) {
      // Non-superadmins default to "Resources" (existing or placeholder)
      const resourcesOption = sortedFolders.find(f => f.name.toLowerCase() === 'resources');
      if (resourcesOption) {
        setSelectedFolderId(resourcesOption.id);
        setSelectedFolderName(resourcesOption.name);
      }
    }
  }, [folderId, fyersResourcesFolder?.id, resourcesFolder?.id, sortedFolders.length, isSuperAdmin]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    // Validate file type (accept common document formats)
    const allowedTypes = [
      // Word documents
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.wordprocessingml.template', // .dotx
      'application/vnd.ms-word.document.macroEnabled.12', // .docm
      'application/vnd.ms-word.template.macroEnabled.12', // .dotm
      // PowerPoint
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      // PDF
      'application/pdf',
      // Markdown
      'text/markdown',
      'text/x-markdown',
      // HTML
      'text/html',
      'application/xhtml+xml',
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/bmp',
      'image/webp',
      // CSV
      'text/csv',
      'application/csv',
      // Excel
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm
      // Text
      'text/plain',
      // JSON
      'application/json',
      'text/json',
    ];

    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Please select a valid document file (DOCX, DOTX, DOCM, DOTM, PPTX, PDF, MD, HTML, JPG, PNG, TIFF, BMP, WEBP, CSV, XLSX, XLSM, TXT, JSON)');
      showToast({
        message: 'Please select a valid document file (DOCX, DOTX, DOCM, DOTM, PPTX, PDF, MD, HTML, JPG, PNG, TIFF, BMP, WEBP, CSV, XLSX, XLSM, TXT, JSON)',
        status: 'error',
      });
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (selectedFile.size > maxSize) {
      setError('File size must be less than 50MB');
      showToast({
        message: 'File size must be less than 50MB',
        status: 'error',
      });
      return;
    }

    // Validate that non-super-admin users cannot upload to "FYERS Resources" or its subfolders
    if (!isSuperAdmin && selectedFolderId) {
      const selectedFolder = flatFolders.find(f => f.id === selectedFolderId);
      if (selectedFolder) {
        const nameLower = selectedFolder.name.toLowerCase();
        const pathLower = (selectedFolder.path || '').toLowerCase();
        
        // Check if folder is "FYERS Resources" or inside it
        if (nameLower === 'fyers resources' || pathLower.includes('fyers resources')) {
          setError('Cannot upload files to "FYERS Resources" folder or its subfolders');
          showToast({
            message: 'Cannot upload files to "FYERS Resources" folder or its subfolders',
            status: 'error',
          });
          return;
        }
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Upload document directly with folder_id using saasApi
      // This will automatically assign to the specified folder or Resources if no folder
      // If the placeholder ID is selected, pass undefined to let backend create Resources folder
      const folderIdToUse = (selectedFolderId === RESOURCES_PLACEHOLDER_ID || !selectedFolderId) 
        ? undefined 
        : selectedFolderId;
      
      const response = await saasApi.uploadFile(
        selectedFile, 
        folderIdToUse, // Pass folder ID if selected (undefined for Resources auto-creation)
        orgId || undefined
      );

      if (response) {
        const selectedFolderName = selectedFolderId 
          ? (sortedFolders.find(f => f.id === selectedFolderId)?.name || 'folder')
          : 'Resources';
        
        const folderMessage = `uploaded successfully to ${selectedFolderName}`;
        
        showToast({
          message: `Document "${selectedFile.name}" ${folderMessage}`,
          status: 'success',
        });
        
        onSuccess();
        onClose();
      } else {
        throw new Error('Upload failed');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to upload file';
      setError(errorMessage);
      showToast({
        message: `Failed to upload document: ${errorMessage}`,
        status: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-6 bg-[#F7F7F7] dark:bg-[#222222]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <img src="/assets/export.svg" alt="Upload" className="h-5 w-5 dark:invert" />
            Upload Document
          </DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Select a document file to upload and store in the database
          </p>
        </DialogHeader>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select File
            </label>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-400 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                accept=".docx,.dotx,.docm,.dotm,.pptx,.pdf,.md,.html,.htm,.xhtml,.jpg,.jpeg,.png,.tiff,.bmp,.webp,.csv,.xlsx,.xlsm,.txt,.json"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {selectedFile ? (
                  <>
                    <FileIcon className="h-12 w-12 text-blue-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </>
                ) : (
                  <>
                    <img src="/assets/export.svg" alt="Upload" className="h-10 w-10 opacity-40 dark:invert" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Click to select a file
                    </span>
                  </>
                )}
              </label>
            </div>
            {selectedFile && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Remove file
              </button>
            )}
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Supports DOCX, DOTX, DOCM, DOTM, PPTX, PDF, MD, HTML, Images (JPG, PNG, TIFF, BMP, WEBP), CSV, XLSX, XLSM, TXT, JSON (Max 50MB)
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Folder (Optional)
            </label>
            <div className="relative">
              <DropdownPopup
                portal={false}
                sameWidth={true}
                anchor={{ x: 'start', y: 'bottom' }}
                menuId="folder-selector-upload"
                isOpen={isFolderMenuOpen}
                setIsOpen={setIsFolderMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    style={{ height: '40px' }}
                    className="w-full flex items-center justify-between gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-[#FFFFFF] dark:bg-[#111111] px-4 text-sm font-normal text-gray-900 dark:text-gray-100 transition-all hover:border-gray-400 dark:hover:border-gray-500"
                  >
                    <span>{selectedFolderName || 'Select Folder'}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Ariakit.MenuButton>
                }
                items={sortedFolders.map((folder) => ({
                  label: `${'  '.repeat(folder.level)}${folder.level > 0 ? '└─ ' : ''}${folder.name}`,
                  onClick: () => {
                    setSelectedFolderId(folder.id);
                    setSelectedFolderName(folder.name);
                    setIsFolderMenuOpen(false);
                  },
                }))}
                className="w-full rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-[#FFFFFF] dark:bg-[#111111] divide-y divide-gray-200 dark:divide-gray-700"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Select a folder to associate this document with in the database.
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-[#FFFFFF] dark:bg-[#111111] text-gray-900 dark:text-gray-100">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !selectedFile} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400">
              {loading ? 'Uploading...' : 'Upload File'}
            </Button>  
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

