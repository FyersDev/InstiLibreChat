import { TooltipAnchor } from '@librechat/client';
import React, { useCallback, useState } from 'react';
import UploadFileModal from '~/components/Resources/Modals/UploadFileModal';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const UploadButton = () => {
  const localize = useLocalize();
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const handleClick = useCallback(() => {
    setShowUploadDialog(true);
  }, []);

  const handleClose = useCallback(() => {
    setShowUploadDialog(false);
  }, []);

  const handleSuccess = useCallback(() => {
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

      {showUploadDialog && <UploadFileModal onClose={handleClose} onSuccess={handleSuccess} />}
    </>
  );
};

export default React.memo(UploadButton);
