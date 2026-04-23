import { Spinner, useToastContext } from '@librechat/client';
import React, { useCallback, useMemo, useState } from 'react';
import { uploadDocument } from '~/data-provider/document-service';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const MAX_SIZE_MB = 50;

interface DocumentUploadProps {
  onUploadSuccess?: (filename: string) => void;
  className?: string;
}

export default function DocumentUpload({ onUploadSuccess, className }: DocumentUploadProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const maxSizeBytes = useMemo(() => MAX_SIZE_MB * 1024 * 1024, []);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file) return;

      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
        'application/vnd.ms-word.document.macroEnabled.12',
        'application/vnd.ms-word.template.macroEnabled.12',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/pdf',
        'text/markdown',
        'text/x-markdown',
        'text/html',
        'application/xhtml+xml',
        'application/xhtml',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/tiff',
        'image/bmp',
        'image/webp',
        'text/csv',
        'application/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel.sheet.macroEnabled.12',
        'text/plain',
        'application/json',
        'text/json',
      ];

      const allowedExtensions = [
        '.docx',
        '.dotx',
        '.docm',
        '.dotm',
        '.pptx',
        '.pdf',
        '.md',
        '.html',
        '.htm',
        '.xhtml',
        '.jpg',
        '.jpeg',
        '.png',
        '.tiff',
        '.bmp',
        '.webp',
        '.csv',
        '.xlsx',
        '.xlsm',
        '.txt',
        '.json',
      ];

      const fileName = file.name.toLowerCase();
      const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        showToast({
          message:
            'Please select a valid document file (PDF, DOCX, XLSX, TXT, CSV, Images, JSON, etc.)',
          status: 'error',
        });
        return;
      }

      if (file.size >= maxSizeBytes) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        console.warn('File size validation failed:', {
          fileName: file.name,
          fileSizeBytes: file.size,
          fileSizeMB: parseFloat(fileSizeMB),
          maxSizeBytes: maxSizeBytes,
          maxSizeMB: MAX_SIZE_MB,
        });
        showToast({
          message: `File "${file.name}" is too large (${fileSizeMB}MB). Maximum file size is ${MAX_SIZE_MB}MB.`,
          status: 'error',
          duration: 5000,
        });
        return;
      }

      setIsUploading(true);
      try {
        if (file.size >= maxSizeBytes) {
          const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
          throw new Error(
            `File size validation failed: ${fileSizeMB}MB exceeds ${MAX_SIZE_MB}MB limit`,
          );
        }

        const response = await uploadDocument(file);

        if (response.code === 200 || response.code === 202 || response.s === 'ok') {
          showToast({
            message: `Document "${file.name}" uploaded successfully and is being processed`,
            status: 'success',
          });
          onUploadSuccess?.(file.name);
        } else {
          throw new Error(response.message || 'Upload failed');
        }
      } catch (error) {
        console.error('Upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        showToast({
          message: `Failed to upload document "${file.name}": ${errorMessage}`,
          status: 'error',
          duration: 5000,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [showToast, onUploadSuccess, maxSizeBytes],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handleUpload(file);
      event.target.value = '';
    },
    [handleUpload],
  );

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex flex-col gap-[var(--Gap-parentChild)]',
          'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
          'bg-fig-Surface-standard p-[var(--Padding-spacer)]',
        )}
      >
        <div className="flex w-full min-w-0 items-center justify-between gap-[var(--Gap-parentChild)]">
          <p className="fy-typography-title-tiny shrink-0 text-fig-Subject-standard">
            {localize('com_ui_upload_file_label')}
          </p>
          <p
            className="fy-typography-body-tiny min-w-0 truncate text-right text-fig-Subject-soft"
            title={localize('com_ui_upload_format_hint')}
          >
            {localize('com_ui_upload_format_hint')}
          </p>
        </div>

        <div
          className={cn(
            'border-[0.5px] border-fig-Stroke-soft',
            'overflow-hidden rounded-[var(--Corner-highlyRounded)]',
            'p-[var(--Padding-spacer)]',
            'transition-colors',
            dragActive ? 'bg-fig-Surface-one-neutral' : 'bg-fig-Surface-standard',
            isUploading && 'pointer-events-none opacity-50',
          )}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="relative flex min-h-[4.5rem] w-full flex-col items-center justify-center py-[var(--Padding-parentChild)] text-center">
            <input
              type="file"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={handleFileChange}
              accept=".docx,.dotx,.docm,.dotm,.pptx,.pdf,.md,.html,.htm,.xhtml,.jpg,.jpeg,.png,.tiff,.bmp,.webp,.csv,.xlsx,.xlsm,.txt,.json"
              disabled={isUploading}
            />

            {isUploading ? (
              <div className="flex flex-col items-center justify-center gap-[var(--Gap-parentChild)] py-[var(--Padding-spacer)]">
                <Spinner size={32} />
                <p className="fy-typography-body-tiny text-fig-Subject-neutral">
                  {localize('com_ui_uploading_document')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-[var(--Gap-parentChild)] rounded-[var(--Corner-highlyRounded)]">
                <div className="flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9">
                  <img
                    src="/research/assets/upload_file.svg"
                    alt=""
                    className="h-6 w-6 object-contain dark:invert"
                  />
                </div>
                <p className="fy-typography-title-tiny max-w-sm text-center text-fig-Subject-standard">
                  {localize('com_ui_upload_drag_cta')}
                </p>
                <p className="fy-typography-body-tiny max-w-sm text-center text-fig-Subject-soft">
                  {localize('com_ui_max_file_size_mb', { 0: String(MAX_SIZE_MB) })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
