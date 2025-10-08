import React, { useState, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import DocumentUpload from '~/components/Documents/DocumentUpload';

interface UploadButtonProps {
  disabled?: boolean;
  conversationId?: string | null;
}

const UploadButton = ({ disabled }: UploadButtonProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const handleClick = useCallback(() => {
    if (isDisabled) return;
    setShowUploadDialog(true);
  }, [isDisabled]);

  const handleUploadSuccess = useCallback((filename: string) => {
    console.log(`Document uploaded: ${filename}`);
    setShowUploadDialog(false);
  }, []);

  return (
    <>
      <TooltipAnchor
        render={
          <button
            disabled={isDisabled}
            onClick={handleClick}
            id="upload-document-button"
            aria-label="Upload Document"
            className={cn(
              'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
              isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
            )}
          >
            <div className="flex w-full items-center justify-center gap-2">
              <Upload className="icon-md" />
            </div>
          </button>
        }
        id="upload-document-button"
        description={localize('com_ui_upload')}
        disabled={isDisabled}
      />

      {showUploadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">{localize('com_ui_upload_files')}</h3>
              <button 
                onClick={() => setShowUploadDialog(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            <DocumentUpload onUploadSuccess={handleUploadSuccess} />
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(UploadButton);
