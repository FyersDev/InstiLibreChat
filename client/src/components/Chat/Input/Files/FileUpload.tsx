import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';

type FileUploadProps = {
  onFileSelected: (jsonData: Record<string, unknown>) => void;
  className?: string;
  containerClassName?: string;
  successText?: string | null;
  invalidText?: string | null;
  validator?: ((data: Record<string, unknown>) => boolean) | null;
  text?: string | null;
  id?: string;
};

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  className = '',
  containerClassName = '',
  successText = null,
  invalidText = null,
  validator = null,
  text = null,
  id = '1',
}) => {
  const [statusColor, setStatusColor] = useState('text-gray-600');
  const [status, setStatus] = useState<null | 'success' | 'invalid'>(null);
  const localize = useLocalize();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target?.result as string);

        if (validator && !validator(jsonData)) {
          setStatus('invalid');
          setStatusColor('text-red-600');
          return;
        }

        if (validator) {
          setStatus('success');
          setStatusColor('text-green-500 dark:text-green-500');
        }

        onFileSelected(jsonData);
      } catch {
        setStatus('invalid');
        setStatusColor('text-red-600');
      }
    };

    reader.readAsText(file);
  };

  const statusText =
    status === 'success'
      ? successText ?? localize('com_ui_upload_success')
      : status === 'invalid'
        ? invalidText ?? localize('com_ui_upload_invalid')
        : text ?? localize('com_ui_import');

  const handleClick = () => {
    const fileInput = document.getElementById(`file-upload-${id}`) as HTMLInputElement | null;
    fileInput?.click();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'mr-1 flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-normal transition-colors hover:bg-gray-100 hover:text-green-600 focus:ring-ring dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-green-500',
          statusColor,
          containerClassName,
        )}
        aria-label={statusText}
      >
        <FileUp className="mr-1 w-[22px] stroke-1" aria-hidden="true" />
        <span className="text-xs">{statusText}</span>
      </button>

      <input
        id={`file-upload-${id}`}
        type="file"
        className={cn('hidden', className)}
        accept=".json"
        onChange={handleFileChange}
        tabIndex={-1}
      />
    </>
  );
};

export default FileUpload;
