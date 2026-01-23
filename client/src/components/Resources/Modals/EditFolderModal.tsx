import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, useToastContext } from '@librechat/client';
import { Input } from '@librechat/client';
import { Button } from '@librechat/client';
import { saasApi } from '~/services/saasApi';

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
    // Debug: Log folder info to help diagnose issues
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
    
    // Check if trying to rename a folder to "Reports" (case-insensitive)
    const folderNameLower = formData.name.trim().toLowerCase();
    const originalNameLower = folder.name.toLowerCase();
    
    // Only check if the name is being changed to "Reports"
    if ((folderNameLower === 'reports' || folderNameLower === 'report') && originalNameLower !== folderNameLower) {
      const errorMsg = 'Cannot rename folder to "Reports". Reports folder already exists.';
      setError(errorMsg);
      showToast({
        message: errorMsg,
        status: 'error',
      });
      return;
    }
    
    // Validate folder ID exists
    if (!folder.id) {
      setError('Invalid folder: missing folder ID');
      console.error('EditFolderModal - Folder ID is missing:', folder);
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      console.log('EditFolderModal - Updating folder:', { id: folder.id, name: formData.name });
      await saasApi.updateFolder(folder.id, {
        name: formData.name,
      });
      showToast({
        message: `Folder "${formData.name}" updated successfully`,
        status: 'success',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error updating folder:', err);
      // Extract error message from various possible formats
      const errorMessage = err?.message || err?.error || err?.response?.data?.message || 'Failed to update folder';
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
      <DialogContent className="max-w-md p-6 bg-[#F7F7F7] dark:bg-[#222222]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Edit Folder</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Folder Name *
            </label>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter folder name"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-[#FFFFFF] dark:bg-[#111111] text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400" >
              {loading ? 'Updating...' : 'Update Folder'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

