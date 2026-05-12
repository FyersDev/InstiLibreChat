import { useState, useRef, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@librechat/client';
import { Button } from '@librechat/client';
import { useToastContext, DropdownPopup } from '@librechat/client';
import { saasApi } from '~/services/saasApi';
import { File as FileIcon, ChevronDown, X } from 'lucide-react';
import { cn } from '~/utils';
import {
  isResearchAllowedUploadFile,
  RESEARCH_ALLOWED_ACCEPT,
} from '~/utils/researchAllowedExtensions';
import {
  isResearchDefaultUploadFolder,
  isResearchReportsFolder,
} from '~/utils/researchFolders';
import { isResearchSystemRow } from '~/utils/researchOwner';

function findFolderById(nodes: any[], id: string): any | null {
  for (const n of nodes) {
    if (String(n.id) === String(id)) {
      return n;
    }
    if (n.children?.length) {
      const found = findFolderById(n.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

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
  org_id?: string | null;
  is_system?: boolean;
  isSystem?: boolean;
  folder_kind?: string;
  rename_locked?: boolean;
}

export default function UploadFileModal({
  folderId,
  orgId,
  folders = [],
  isSuperAdmin: _isSuperAdmin = false,
  isOrgAdmin: isOrgAdminProp,
  currentUserId: currentUserIdProp,
  onClose,
  onSuccess,
}: UploadFileModalProps) {
  const { showToast } = useToastContext();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(folderId || '');
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [folderTree, setFolderTree] = useState<any[]>(folders);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use props if provided, otherwise get from localStorage
  const userInfoStr = localStorage.getItem('userInfo');
  const userInfo = userInfoStr ? JSON.parse(userInfoStr) : null;
  const currentUserId = currentUserIdProp || (userInfo?.user_id || userInfo?.id)?.toString();
  const isOrgAdmin = isOrgAdminProp !== undefined ? isOrgAdminProp : userInfo?.org_role === 'admin';

  const resolvedOrgId =
    orgId != null && String(orgId).trim() !== ''
      ? orgId
      : userInfo?.org_id != null && String(userInfo.org_id).trim() !== ''
        ? String(userInfo.org_id)
        : null;

  useEffect(() => {
    setFolderTree(folders);
  }, [folders]);

  useEffect(() => {
    if (folders.length > 0) {
      return;
    }

    let cancelled = false;

    const loadFolders = async () => {
      if (!resolvedOrgId) {
        if (!cancelled) {
          setFoldersError('Organization ID is required.');
          setFolderTree([]);
        }
        return;
      }

      setFoldersLoading(true);
      setFoldersError(null);
      try {
        const data = await saasApi.getFolderTree(resolvedOrgId);
        if (!cancelled) {
          setFolderTree(data.folders ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load folders';
          setFoldersError(message);
          setFolderTree([]);
        }
      } finally {
        if (!cancelled) {
          setFoldersLoading(false);
        }
      }
    };

    void loadFolders();

    return () => {
      cancelled = true;
    };
  }, [folders, resolvedOrgId]);

  // Flatten folder tree for dropdown
  const flattenFolders = (folderNodes: any[], level = 0): FlatFolder[] => {
    let result: FlatFolder[] = [];
    folderNodes.forEach((folder) => {
      result.push({
        id: String(folder.id),
        name: folder.name,
        path: folder.path || folder.name,
        level,
        created_by: folder.created_by,
        org_id: folder.org_id ?? folder.orgId,
        is_system: folder.is_system,
        isSystem: folder.isSystem,
        folder_kind: folder.folder_kind ?? folder.folderKind,
        rename_locked: folder.rename_locked ?? folder.renameLocked,
      });
      if (folder.children && folder.children.length > 0) {
        result = result.concat(flattenFolders(folder.children, level + 1));
      }
    });
    return result;
  };

  const flatFolders = flattenFolders(folderTree);

  const filteredFolders = flatFolders.filter((folder: any) => {
    if (isResearchReportsFolder(folder)) {
      return false;
    }
    if (isResearchDefaultUploadFolder(folder)) {
      return true;
    }
    if (folder.is_system === true || folder.isSystem === true) {
      return false;
    }
    return true;
  });

  const sortedFolders = [...filteredFolders].sort((a, b) => {
    const pa = isResearchDefaultUploadFolder(a) ? 0 : 1;
    const pb = isResearchDefaultUploadFolder(b) ? 0 : 1;
    return pa - pb;
  });

  useEffect(() => {
    const applyDefaultFolder = () => {
      const primary = sortedFolders.find((f) => isResearchDefaultUploadFolder(f));
      if (primary) {
        setSelectedFolderId(primary.id);
        setSelectedFolderName(primary.name);
      } else if (sortedFolders.length > 0) {
        setSelectedFolderId(sortedFolders[0].id);
        setSelectedFolderName(sortedFolders[0].name);
      } else {
        setSelectedFolderId('');
        setSelectedFolderName('');
      }
    };

    if (folderId) {
      const treeNode = findFolderById(folderTree, folderId);
      if (treeNode && isResearchSystemRow(treeNode) && !isResearchDefaultUploadFolder(treeNode)) {
        applyDefaultFolder();
        return;
      }
      setSelectedFolderId(folderId);
      const folder = sortedFolders.find((f) => f.id === folderId);
      if (folder) {
        setSelectedFolderName(folder.name);
      }
    } else {
      applyDefaultFolder();
    }
  }, [folderId, folderTree, sortedFolders.length]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (!isResearchAllowedUploadFile(file)) {
      const msg = 'This file type is not allowed.';
      setError(msg);
      showToast({ message: msg, status: 'error' });
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    if (!isResearchAllowedUploadFile(selectedFile)) {
      const msg = 'This file type is not allowed.';
      setError(msg);
      showToast({ message: msg, status: 'error' });
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

    if (selectedFolderId && folderTree.length > 0) {
      const targetNode = findFolderById(folderTree, selectedFolderId);
      if (
        targetNode &&
        isResearchSystemRow(targetNode) &&
        !isResearchDefaultUploadFolder(targetNode)
      ) {
        const msg = 'Documents can only be uploaded to organization folders, not system folders.';
        setError(msg);
        showToast({ message: msg, status: 'error' });
        return;
      }
    }

    if (sortedFolders.length > 0 && !selectedFolderId) {
      const msg = 'Please select a folder.';
      setError(msg);
      showToast({ message: msg, status: 'error' });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const folderIdToUse = selectedFolderId || undefined;

      const response = await saasApi.uploadFile(
        selectedFile,
        folderIdToUse,
        resolvedOrgId ?? undefined,
      );

      if (response) {
        const folderLabel = selectedFolderId
          ? sortedFolders.find((f) => f.id === selectedFolderId)?.name
          : undefined;
        const folderMessage = folderLabel
          ? `uploaded successfully to ${folderLabel}`
          : 'uploaded successfully';

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
              <span className="fy-typography-title-tiny text-fig-Subject-standard">
                Upload file
              </span>

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
                  accept={RESEARCH_ALLOWED_ACCEPT}
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
                {foldersLoading ? (
                  <p className="fy-typography-body-tiny text-fig-Subject-soft">Loading folders...</p>
                ) : null}
                {foldersError ? (
                  <p className="fy-typography-body-tiny text-fig-Subject-danger">{foldersError}</p>
                ) : null}
                {!foldersLoading && sortedFolders.length === 0 ? (
                  <p className="fy-typography-body-tiny text-fig-Subject-soft">
                    No upload folders are available.
                  </p>
                ) : null}
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
                disabled={
                  loading ||
                  foldersLoading ||
                  !selectedFile ||
                  (sortedFolders.length > 0 && !selectedFolderId)
                }
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
