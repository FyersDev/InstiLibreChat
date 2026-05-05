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
import { useEffect, useState } from 'react';
import { saasApi } from '~/services/saasApi';
import { cn } from '~/utils';
import {
  isResearchDefaultUploadFolder,
  isResearchReportsFolder,
  researchRenameLocked,
} from '~/utils/researchFolders';

interface EditFolderModalProps {
  folder: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditFolderModal({ folder, onClose, onSuccess }: EditFolderModalProps) {
  const { showToast } = useToastContext();
  const [formData, setFormData] = useState({
    name: folder.name || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({ name: folder.name || '' });
    if (folder.id) {
      console.log('EditFolderModal - Folder info:', {
        id: folder.id,
        name: folder.name,
        created_by: folder.created_by,
      });
    }
  }, [folder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      researchRenameLocked(folder) ||
      isResearchReportsFolder(folder) ||
      isResearchDefaultUploadFolder(folder)
    ) {
      const errorMsg = 'This folder cannot be renamed.';
      setError(errorMsg);
      showToast({ message: errorMsg, status: 'error' });
      return;
    }

    if (!folder.id) {
      setError('Invalid folder: missing folder ID');
      console.error('EditFolderModal - Folder ID is missing:', folder);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('EditFolderModal - Updating folder:', { id: folder.id, name: formData.name });
      await saasApi.updateFolder(folder.id, { name: formData.name });
      showToast({
        message: `Folder "${formData.name}" updated successfully`,
        status: 'success',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error updating folder:', err);
      const errorMessage =
        err?.message || err?.error || err?.response?.data?.message || 'Failed to update folder';
      setError(errorMessage);
      showToast({
        message: `Failed to update folder: ${errorMessage}`,
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
          'text-fig-Subject-standard shadow-none',
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
              {'Edit folder'}
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
        <div className="flex flex-col gap-[var(--Gap-parentChild)] px-[var(--Gap-parentChild)] py-[var(--Padding-spacer)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--Gap-parentChild)]">
            {/* Inner card */}
            <div
              className={cn(
                'flex flex-col gap-[var(--Gap-zero-spacer)]',
                'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                'p-[var(--Padding-spacer)]',
              )}
            >
              {/* Error */}
              {error && (
                <div
                  className={cn(
                    'fy-typography-body-small',
                    'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                    'bg-fig-Surface-one-danger px-[var(--Padding-zero-neighbor)] py-[var(--Padding-zero-buddy)]',
                    'text-fig-Subject-danger',
                  )}
                >
                  {error}
                </div>
              )}

              {/* Folder name field */}
              <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                <label className="fy-typography-label-small text-fig-Subject-neutral">
                  {'Folder name'}
                </label>
                <Input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter folder name"
                  className={cn(
                    'fy-typography-body-small h-[var(--Size-input)] w-full',
                    'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                    '!bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] !text-fig-Subject-standard',
                    '!placeholder:text-fig-Subject-soft',
                    'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
                    'transition-colors duration-200',
                  )}
                />
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-[var(--Gap-zero-neighbor)]">
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
                {loading ? 'Updating...' : 'Update folder'}
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
                {'Dismiss'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
