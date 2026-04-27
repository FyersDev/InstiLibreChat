import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  useToastContext,
} from '@librechat/client';
import { X } from 'lucide-react';
import { useState } from 'react';
import { saasApi } from '~/services/saasApi';
import { cn } from '~/utils';

interface CreateFolderModalProps {
  parentId?: string;
  orgId?: string | null;
  isSuperAdmin?: boolean;
  folders?: any[];
  onClose: () => void;
  onSuccess: () => void;
}

// Helper function to check if a folder is FYERS Resources or inside it
const isFolderId_InFyersResources = (folderId: string | undefined, folders: any[]): boolean => {
  if (!folderId || !folders.length) return false;

  // Recursive function to find folder and check its path
  const findFolder = (id: string, folderList: any[]): any => {
    for (const folder of folderList) {
      if (folder.id === id) return folder;
      if (folder.children && folder.children.length > 0) {
        const found = findFolder(id, folder.children);
        if (found) return found;
      }
    }
    return null;
  };

  const folder = findFolder(folderId, folders);
  if (!folder) return false;

  // Check if folder name is "FYERS Resources" or path contains it
  const nameLower = folder.name?.toLowerCase() || '';
  const pathLower = folder.path?.toLowerCase() || '';

  return nameLower === 'fyers resources' || pathLower.includes('fyers resources');
};

export default function CreateFolderModal({
  parentId,
  orgId,
  isSuperAdmin = false,
  folders = [],
  onClose,
  onSuccess,
}: CreateFolderModalProps) {
  const { showToast } = useToastContext();
  const [formData, setFormData] = useState({
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if trying to create a folder named "Reports" (case-insensitive)
    const folderNameLower = formData.name.trim().toLowerCase();
    if (folderNameLower === 'reports' || folderNameLower === 'report') {
      const errorMsg = 'Cannot create folder named "Reports". Reports folder already exists.';
      setError(errorMsg);
      showToast({
        message: errorMsg,
        status: 'error',
      });
      return;
    }

    // Check if non-superadmin is trying to create folder inside FYERS Resources
    if (!isSuperAdmin && isFolderId_InFyersResources(parentId, folders)) {
      setError('Cannot create folders inside "FYERS Resources"');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await saasApi.createFolder({
        name: formData.name,
        parent_id: parentId || undefined,
        org_id: orgId || undefined,
      });
      showToast({
        message: `Folder "${formData.name}" created successfully`,
        status: 'success',
      });
      onSuccess();
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create folder';
      setError(errorMessage);
      showToast({
        message: `Failed to create folder: ${errorMessage}`,
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
            'px-[var(--Gap-parentChild)] py-0',
          )}
        >
          <div className="flex items-center justify-between gap-[var(--Gap-parentChild)] pt-[var(--Padding-spacer)]">
            <DialogTitle className="fy-typography-title m-0 text-fig-Subject-standard">
              {parentId ? 'Create New Folder Inside' : 'Create New Folder'}
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
          {parentId && (
            <p className="fy-typography-body-small mt-[var(--Gap-zero-sibling)] text-fig-Subject-neutral">
              This folder will be created inside the selected folder
            </p>
          )}
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-col gap-[var(--Gap-zero-parentChild)] px-[var(--Gap-parentChild)] py-[var(--Padding-spacer)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
            <div
              className={cn(
                'flex flex-col gap-[var(--Gap-zero-sibling)]',
                'rounded-[var(--Corner-highlyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                'px-[var(--Padding-spacer)] py-[var(--Padding-spacer)]',
              )}
            >
              <label className="fy-typography-label-small text-fig-Subject-standard">
                Folder Name
              </label>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Example: Company financials"
                className={cn(
                  'fy-typography-body-small h-[var(--Size-input)] w-full',
                  'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                  'bg-fig-Surface-standard px-[var(--Padding-zero-neighbor)] text-fig-Subject-standard',
                  'placeholder:text-fig-Subject-soft',
                  'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
                  'transition-colors duration-200',
                )}
              />
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-[var(--Gap-zero-neighbor)] pt-[var(--Padding-spacer)]">
              <div className="flex gap-[var(--Gap-zero-neighbor)]">
                <Button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    'fy-typography-label h-[var(--Size-button)] rounded-[2px]',
                    'border border-fig-Stroke-primary bg-fig-Surface-two-primary !text-fig-Subject-two-primary',
                    'transition-opacity hover:opacity-90',
                    'hover:!border-fig-Stroke-primary hover:!bg-fig-Surface-two-primary hover:!text-fig-Subject-two-primary',
                    'disabled:opacity-50',
                  )}
                >
                  {loading ? 'Creating...' : 'Create'}
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
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
