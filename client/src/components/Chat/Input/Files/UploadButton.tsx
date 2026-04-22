import React, { useState, useCallback } from 'react';
import {
  TooltipAnchor,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import DocumentUpload from '~/components/Documents/DocumentUpload';

const UploadButton = () => {
  const localize = useLocalize();
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const handleClick = useCallback(() => {
    setShowUploadDialog(true);
  }, []);

  const handleUploadSuccess = useCallback((filename: string) => {
    console.log(`Document uploaded: ${filename}`);
    setShowUploadDialog(false);
  }, []);

  return (
    <>
      <TooltipAnchor
        id="upload-document-button"
        description={localize('com_ui_upload')}
        render={
          <button
            onClick={handleClick}
            id="upload-document-button"
            aria-label="Upload Document"
            className={cn(
              'flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] border border-fig-Stroke-standard',
              'bg-transparent p-px transition-colors hover:bg-fig-Surface-one-standard focus:outline-none focus:ring-2 focus:ring-fig-Stroke-primary focus:ring-opacity-40',
            )}
          >
            <div className="flex w-full items-center justify-center">
              <img
                src="/research/assets/export.svg"
                alt="Upload Document"
                className="icon-md h-5 w-5 dark:invert"
              />
            </div>
          </button>
        }
      />

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md p-6" showCloseButton>
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-semibold">
              {localize('com_ui_upload_files')}
            </DialogTitle>
          </DialogHeader>

          <DocumentUpload onUploadSuccess={handleUploadSuccess} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default React.memo(UploadButton);
