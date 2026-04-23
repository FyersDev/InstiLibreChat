import { Dialog, DialogContent, DialogHeader, DialogTitle, TooltipAnchor } from '@librechat/client';
import { X } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import DocumentUpload from '~/components/Documents/DocumentUpload';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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
        <DialogContent
          showCloseButton={false}
          className={cn(
            'max-w-[var(--Size-overlay)] gap-0 overflow-hidden p-0',
            'border border-fig-Stroke-standard bg-fig-Surface-one-standard',
            'rounded-[var(--Corner-highlyRounded)]',
            'shadow-none',
            'data-[state=open]:sm:zoom-in-95',
            'max-md:!rounded-[var(--Corner-highlyRounded)] max-md:!bg-fig-Surface-one-standard',
            'text-fig-Subject-standard',
            'dark:bg-fig-Surface-one-standard',
          )}
        >
          <DialogHeader
            className={cn(
              'mb-0 flex flex-row items-center justify-between space-y-0 border-0',
              'gap-[var(--Gap-parentChild)]',
              'px-[var(--Gap-parentChild)] pt-[var(--Padding-zero-parentChild)]',
            )}
          >
            <DialogTitle className="fy-typography-title m-0 min-w-0 flex-1 text-fig-Subject-standard">
              {localize('com_ui_upload_document')}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setShowUploadDialog(false)}
              className={cn(
                'inline-flex h-[var(--Size-icon)] w-[var(--Size-icon)] shrink-0 items-center justify-center',
                'rounded-[var(--Corner-moderatelyRounded)]',
                'text-fig-Subject-standard transition-colors',
                'hover:bg-fig-Surface-neutral',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-fig-Stroke-primary',
              )}
              aria-label={localize('com_ui_close')}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </DialogHeader>
          <div className="mt-[var(--Gap-parentChild)] px-[var(--Gap-parentChild)] pb-[var(--Padding-spacer)]">
            <DocumentUpload onUploadSuccess={handleUploadSuccess} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default React.memo(UploadButton);
