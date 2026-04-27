import { useState, useRef, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@librechat/client';
import { Button } from '@librechat/client';
import { useToastContext, DropdownPopup } from '@librechat/client';
import { uploadDocument } from '~/data-provider/document-service';
import { saasApi } from '~/services/saasApi';
import { File as FileIcon, ChevronDown, X } from 'lucide-react';
import { cn } from '~/utils';

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

export default function UploadFileModal({
  folderId,
  orgId,
  folders = [],
  isSuperAdmin = false,
  isOrgAdmin: isOrgAdminProp,
  currentUserId: currentUserIdProp,
  onClose,
  onSuccess,
}: UploadFileModalProps) {
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
  const isOrgAdmin = isOrgAdminProp !== undefined ? isOrgAdminProp : userInfo?.org_role === 'admin';

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
  const filteredFolders = flatFolders.filter((folder: any) => {
    const nameLower = folder.name.toLowerCase();

    // Always filter out "Reports" folder
    if (nameLower === 'reports') return false;

    // Show "FYERS Resources" only for super admin
    if (nameLower === 'fyers resources') {
      return isSuperAdmin;
    }

    // Show all other folders (backend already filtered by user access)
    return true;
  });

  // Find the "Resources" folder to set as default (NOT "FYERS Resources")
  const resourcesFolder = filteredFolders.find(
    (folder) => folder.name.toLowerCase() === 'resources',
  );

  // Find "FYERS Resources" folder (for superadmins)
  const fyersResourcesFolder = filteredFolders.find(
    (folder) => folder.name.toLowerCase() === 'fyers resources',
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
      const folder = sortedFolders.find((f) => f.id === folderId);
      if (folder) {
        setSelectedFolderName(folder.name);
      }
    } else if (isSuperAdmin && fyersResourcesFolder) {
      // Superadmins default to "FYERS Resources"
      setSelectedFolderId(fyersResourcesFolder.id);
      setSelectedFolderName(fyersResourcesFolder.name);
    } else if (!isSuperAdmin) {
      // Non-superadmins default to "Resources" (existing or placeholder)
      const resourcesOption = sortedFolders.find((f) => f.name.toLowerCase() === 'resources');
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
      setError(
        'Please select a valid document file (DOCX, DOTX, DOCM, DOTM, PPTX, PDF, MD, HTML, JPG, PNG, TIFF, BMP, WEBP, CSV, XLSX, XLSM, TXT, JSON)',
      );
      showToast({
        message:
          'Please select a valid document file (DOCX, DOTX, DOCM, DOTM, PPTX, PDF, MD, HTML, JPG, PNG, TIFF, BMP, WEBP, CSV, XLSX, XLSM, TXT, JSON)',
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
      const selectedFolder = flatFolders.find((f) => f.id === selectedFolderId);
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
      const folderIdToUse =
        selectedFolderId === RESOURCES_PLACEHOLDER_ID || !selectedFolderId
          ? undefined
          : selectedFolderId;

      const response = await saasApi.uploadFile(
        selectedFile,
        folderIdToUse, // Pass folder ID if selected (undefined for Resources auto-creation)
        orgId || undefined,
      );

      if (response) {
        const selectedFolderName = selectedFolderId
          ? sortedFolders.find((f) => f.id === selectedFolderId)?.name || 'folder'
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
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex w-full max-w-[var(--Size-overlay)] flex-col overflow-hidden p-0',
          'gap-0',
          'border border-fig-Stroke-soft !bg-fig-Surface-one-standard',
          'rounded-[var(--Corner-highlyRounded)]',
          'shadow-none',
          'text-fig-Subject-standard',
          'dark:!bg-fig-Surface-one-standard',
        )}
      >
        {/* Header */}
        <DialogHeader
          className={cn(
            'mb-0 flex shrink-0 flex-col space-y-0 border-0',
            'px-[var(--Gap-parentChild)] pt-[var(--Padding-zero-parentChild)]',
          )}
        >
          <div className="flex items-center justify-between gap-[var(--Gap-parentChild)]">
            <DialogTitle className="fy-typography-title m-0 text-fig-Subject-standard">
              Upload document
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'inline-flex h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] items-center justify-center',
                'rounded-[var(--Corner-moderatelyRounded)] text-fig-Subject-standard transition-colors',
                'hover:bg-fig-Surface-neutral',
                'focus:outline-none focus-visible:ring-fig-Stroke-primary',
              )}
              aria-label="Close"
            >
              <X className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)]" aria-hidden />
            </button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-col gap-[var(--Gap-parentChild)] px-[var(--Gap-parentChild)] py-[var(--Padding-sibling)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--Gap-parentChild)]">
            {/* Inner card */}
            <div
              className={cn(
                'flex flex-col gap-[var(--Gap-zero-spacer)]',
                'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                'p-[var(--Padding-spacer)]',
              )}
            >
              {/* Upload file row label */}
              <div className="flex items-center justify-between">
                <span className="fy-typography-title-tiny text-fig-Subject-standard">
                  Upload file
                </span>
                <span className="fy-typography-body-tiny text-right text-fig-Subject-soft">
                  {`File format: .txt & .csv`}
                </span>
              </div>

              {/* Drop zone */}
              <div
                className={cn(
                  'flex flex-col items-center justify-center gap-[var(--Gap-parentChild)]',
                  'rounded-[var(--Corner-highlyRounded)] border border-fig-Stroke-soft',
                  'py-[var(--Padding-parentChildVertical)] transition-colors',
                  'hover:border-fig-Stroke-primary hover:bg-fig-Surface-primary',
                )}
              >
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
                  className="flex cursor-pointer flex-col items-center gap-[var(--Gap-parentChild)]"
                >
                  {selectedFile ? (
                    <>
                      <FileIcon className="h-8 w-8 text-fig-Subject-primary" aria-hidden />
                      <div className="flex flex-col items-center gap-[var(--Gap-zero-parentChild)]">
                        <span className="fy-typography-title-tiny text-fig-Subject-standard">
                          {selectedFile.name}
                        </span>
                        <span className="fy-typography-label-tiny text-fig-Subject-soft">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <img
                        src="/research/assets/upload_file.svg"
                        alt=""
                        className="h-8 w-[25px] opacity-70 dark:opacity-100"
                      />
                      <div className="flex flex-col items-center gap-[var(--Gap-zero-parentChild)]">
                        <span className="fy-typography-title-tiny text-fig-Subject-standard">
                          {`Drag & drop or click to upload`}
                        </span>
                        <span className="fy-typography-label-tiny text-center text-fig-Subject-soft">
                          Maximum file size: 50 MB
                        </span>
                      </div>
                    </>
                  )}
                </label>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    className="fy-typography-label-tiny text-fig-Subject-danger hover:underline"
                  >
                    Remove file
                  </button>
                )}
              </div>

              {/* Folder selector */}
              <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                <label className="fy-typography-label-small text-fig-Subject-neutral">
                  Select folder to save the file
                </label>
                <DropdownPopup
                  portal={false}
                  sameWidth={true}
                  anchor={{ x: 'start', y: 'bottom' }}
                  menuId="folder-selector-upload"
                  isOpen={isFolderMenuOpen}
                  setIsOpen={setIsFolderMenuOpen}
                  trigger={
                    <Ariakit.MenuButton
                      className={cn(
                        'fy-typography-body flex h-[var(--Size-zero-button)] w-full items-center justify-between',
                        'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                        'px-[var(--Padding-zero-spacer)] text-fig-Subject-standard',
                        'transition-colors hover:border-fig-Stroke-standard',
                      )}
                    >
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis text-left">
                        {selectedFolderName || 'Select Folder'}
                      </span>
                      <ChevronDown
                        className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] shrink-0 text-fig-Subject-soft"
                        aria-hidden
                      />
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
                  className={cn(
                    'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                    'bg-fig-Surface-standard shadow-sm',
                  )}
                  itemClassName={cn(
                    'fy-typography-body px-[var(--Padding-zero-neighbor)] py-[var(--Padding-zero-buddy)]',
                    'text-fig-Subject-standard hover:bg-fig-Surface-neutral',
                    'cursor-pointer transition-colors',
                  )}
                />
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-[var(--Gap-zero-neighbor)]">
              <Button
                type="submit"
                disabled={loading || !selectedFile}
                className={cn(
                  'fy-typography-label h-[var(--Size-button)] rounded-[2px]',
                  'border border-fig-Stroke-primary bg-fig-Surface-two-primary !text-fig-Subject-two-primary',
                  'transition-opacity hover:opacity-90',
                  'hover:!border-fig-Stroke-primary hover:!bg-fig-Surface-two-primary hover:!text-fig-Subject-two-primary',
                  'disabled:opacity-50',
                )}
              >
                {loading ? 'Uploading...' : 'Import'}
              </Button>
              <Button
                type="button"
                onClick={onClose}
                className={cn(
                  'fy-typography-label h-[var(--Size-button)] rounded-[2px]',
                  'border border-fig-Stroke-standard bg-transparent !text-fig-Subject-standard',
                  'transition-colors hover:bg-fig-Surface-neutral',
                  'hover:!border-fig-Stroke-standard hover:!bg-fig-Surface-neutral hover:!text-fig-Subject-standard',
                )}
              >
                Dismiss
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
