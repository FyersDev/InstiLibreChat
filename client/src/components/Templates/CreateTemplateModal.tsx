import { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownPopup,
  Input,
  TextareaAutosize,
} from '@librechat/client';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '~/utils';

export default function CreateTemplateModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (template: any) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    name: '',
    framework: '',
    customTemplate: false,
    fields: {} as Record<string, string>,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFrameworkMenuOpen, setIsFrameworkMenuOpen] = useState(false);

  const frameworks = {
    'R-T-F': {
      name: 'R-T-F Framework',
      fields: {
        R: 'Act as a [ROLE]',
        T: 'Create a [TASK]',
        F: 'Show as [FORMAT]',
      },
    },
    'T-A-G': {
      name: 'T-A-G Framework',
      fields: {
        T: 'Define the [TASK]',
        A: 'State the [ACTION]',
        G: 'Clarify the [GOAL]',
      },
    },
    'B-A-B': {
      name: 'B-A-B Framework',
      fields: {
        B1: 'Explain the problem [BEFORE]',
        A: 'State the outcome [AFTER]',
        B2: 'Ask ChatGPT to be the [BRIDGE] between the two',
      },
    },
    'C-A-R-E': {
      name: 'C-A-R-E Framework',
      fields: {
        C: 'Give the [CONTEXT]',
        A: 'Describe the [ACTION]',
        R: 'Clarify the [RESULT]',
        E: 'Give the [EXAMPLE]',
      },
    },
    'R-I-S-E': {
      name: 'R-I-S-E Framework',
      fields: {
        R: 'Specify the [ROLE]',
        I: 'Describe the [INPUT]',
        S: 'Ask for [STEPS]',
        E: 'Describe the [EXPECTATION]',
      },
    },
  };

  const handleFrameworkChange = (framework: string) => {
    if (framework === 'custom') {
      setFormData({ ...formData, framework: '', customTemplate: true, fields: {} });
    } else {
      setFormData({
        ...formData,
        framework,
        customTemplate: false,
        fields: (frameworks as any)[framework]?.fields ?? {},
      });
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData({ ...formData, fields: { ...formData.fields, [key]: value } });
  };

  const frameworkLabel = (() => {
    if (formData.customTemplate) return 'Custom template';
    if (formData.framework) return (frameworks as any)[formData.framework].name as string;
    return 'None';
  })();

  const renderBodyFields = () => {
    if (formData.framework && !formData.customTemplate) {
      return (
        <div className="flex flex-col gap-[var(--Gap-zero-spacer)]">
          <p className="fy-typography-label-tiny text-fig-Subject-primary">
            {(frameworks as any)[formData.framework].name}
          </p>
          {Object.entries((frameworks as any)[formData.framework].fields).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
              <label className="fy-typography-label-small text-fig-Subject-neutral">
                {String(label)}
              </label>
              <TextareaAutosize
                value={formData.fields[key] || ''}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
                }}
                placeholder={`Enter ${String(label).toLowerCase()}`}
                required
                minRows={2}
                maxRows={6}
                aria-label={String(label)}
                className={cn(
                  'fy-typography-body-small w-full resize-none',
                  'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                  'bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] py-[var(--Padding-zero-buddy)]',
                  'text-fig-Subject-standard placeholder:text-fig-Subject-soft',
                  'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
                  'transition-colors duration-200',
                )}
              />
            </div>
          ))}
        </div>
      );
    }

    if (formData.customTemplate) {
      return (
        <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
          <label className="fy-typography-label-small text-fig-Subject-neutral">
            {'Description'}
            <span className="text-fig-Subject-danger"> {'*'}</span>
          </label>
          <TextareaAutosize
            value={formData.fields.custom || ''}
            onChange={(e) => handleFieldChange('custom', e.target.value)}
            minRows={4}
            maxRows={10}
            placeholder="Example: Create custom templates for executive, analytical view."
            required
            aria-label="Custom template content"
            className={cn(
              'fy-typography-body-small w-full resize-none',
              'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
              'bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] py-[var(--Padding-zero-buddy)]',
              'text-fig-Subject-standard placeholder:text-fig-Subject-soft',
              'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
              'transition-colors duration-200',
            )}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
        <label className="fy-typography-label-small text-fig-Subject-neutral">
          {'Description'}
        </label>
        <TextareaAutosize
          value={formData.fields.custom || ''}
          onChange={(e) => handleFieldChange('custom', e.target.value)}
          minRows={3}
          maxRows={8}
          placeholder="Example: Create custom templates for executive, analytical view."
          aria-label="Template description"
          className={cn(
            'fy-typography-body-small w-full resize-none',
            'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
            'bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] py-[var(--Padding-zero-buddy)]',
            'text-fig-Subject-standard placeholder:text-fig-Subject-soft',
            'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
            'transition-colors duration-200',
          )}
        />
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Template name is required');
      return;
    }

    if (formData.customTemplate) {
      if (!formData.fields.custom?.trim()) {
        setError('Custom template content is required');
        return;
      }
    } else {
      const frameworkFields = (frameworks as any)[formData.framework]?.fields || {};
      const allFilled = Object.keys(frameworkFields).every((key) => {
        const value = formData.fields[key];
        return value && value.trim() !== '';
      });
      if (!allFilled) {
        setError('Please fill in all framework fields');
        return;
      }
    }

    const template = {
      name: formData.name,
      framework: formData.customTemplate ? 'custom' : formData.framework,
      is_custom: formData.customTemplate,
      content: formData.fields,
    };

    setLoading(true);
    try {
      await onSave(template);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create template');
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
            'px-[var(--Gap-parentChild)] pt-[var(--Padding-sibling)]',
          )}
        >
          <div className="flex items-center justify-between gap-[var(--Gap-parentChild)]">
            <DialogTitle className="fy-typography-title m-0 text-fig-Subject-standard">
              {'Create template'}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'inline-flex h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] items-center justify-center',
                'rounded-[var(--Corner-moderatelyRounded)] text-fig-Subject-standard transition-colors',
                'hover:bg-fig-Surface-neutral focus:outline-none focus-visible:ring-fig-Stroke-primary',
              )}
              aria-label="Close"
            >
              <X className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)]" aria-hidden />
            </button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex max-h-[70vh] flex-col gap-[var(--Gap-parentChild)] overflow-y-auto px-[var(--Gap-parentChild)] py-[var(--Padding-sibling)]">
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

          <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--Gap-parentChild)]">
            {/* Inner card */}
            <div
              className={cn(
                'flex flex-col gap-[var(--Gap-zero-spacer)]',
                'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                'p-[var(--Padding-spacer)]',
              )}
            >
              {/* Template name */}
              <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                <label className="fy-typography-label-small text-fig-Subject-neutral">
                  {'Template name'}
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Example: Executive summary, detailed company analysis"
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

              {/* Framework selector */}
              <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                <label className="fy-typography-label-small text-fig-Subject-neutral">
                  {'Select framework'}
                </label>
                <DropdownPopup
                  portal={false}
                  sameWidth={true}
                  anchor={{ x: 'start', y: 'bottom' }}
                  menuId="framework-selector-create"
                  isOpen={isFrameworkMenuOpen}
                  setIsOpen={setIsFrameworkMenuOpen}
                  trigger={
                    <Ariakit.MenuButton
                      className={cn(
                        'fy-typography-body flex h-[var(--Size-input)] w-full items-center justify-between',
                        'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                        'px-[var(--Padding-zero-spacer)] text-fig-Subject-standard',
                        'transition-colors hover:border-fig-Stroke-standard',
                      )}
                    >
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis text-left">
                        {frameworkLabel}
                      </span>
                      <ChevronDown
                        className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] shrink-0 text-fig-Subject-soft"
                        aria-hidden
                      />
                    </Ariakit.MenuButton>
                  }
                  items={[
                    {
                      label: 'None',
                      onClick: () => {
                        handleFrameworkChange('');
                        setIsFrameworkMenuOpen(false);
                      },
                    },
                    ...Object.keys(frameworks).map((key) => ({
                      label: (frameworks as any)[key].name,
                      onClick: () => {
                        handleFrameworkChange(key);
                        setIsFrameworkMenuOpen(false);
                      },
                    })),
                    {
                      label: 'Custom template',
                      onClick: () => {
                        handleFrameworkChange('custom');
                        setIsFrameworkMenuOpen(false);
                      },
                    },
                  ]}
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

              {/* Dynamic fields based on selection */}
              {renderBodyFields()}
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
                {'Dismiss'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
