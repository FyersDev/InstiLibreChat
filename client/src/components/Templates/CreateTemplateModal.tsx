import { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, TextareaAutosize, DropdownPopup } from '@librechat/client';
import { ChevronDown } from 'lucide-react';

// Create Template Modal
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
      setFormData({
        ...formData,
        framework: '',
        customTemplate: true,
        fields: {},
      });
    } else {
      setFormData({
        ...formData,
        framework: framework,
        customTemplate: false,
        fields: (frameworks as any)[framework].fields,
      });
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData({
      ...formData,
      fields: {
        ...formData.fields,
        [key]: value,
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.name.trim()) {
      setError('Template name is required');
      return;
    }

    if (formData.customTemplate) {
      if (!formData.fields.custom || !formData.fields.custom.trim()) {
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
    } catch (error: any) {
      setError(error.message || 'Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Create Template</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template Name *
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Framework
            </label>
            <div className="relative">
              <DropdownPopup
                portal={false}
                sameWidth={true}
                anchor={{ x: 'start', y: 'bottom' }}
                menuId="framework-selector-create"
                isOpen={isFrameworkMenuOpen}
                setIsOpen={setIsFrameworkMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    style={{ height: '40px' }}
                    className="w-full flex items-center justify-between gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm font-normal text-gray-900 dark:text-gray-100 transition-all hover:border-gray-400 dark:hover:border-gray-500"
                  >
                    <span>
                      {formData.customTemplate 
                        ? 'Create Custom Template'
                        : formData.framework 
                          ? (frameworks as any)[formData.framework].name
                          : '-- Select Framework --'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Ariakit.MenuButton>
                }
                items={[
                  {
                    label: '-- Select Framework --',
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
                    label: 'Create Custom Template',
                    onClick: () => {
                      handleFrameworkChange('custom');
                      setIsFrameworkMenuOpen(false);
                    },
                  },
                ]}
                className="w-full rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
          </div>

          {formData.framework && !formData.customTemplate && (
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-5 mt-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                {(frameworks as any)[formData.framework].name}
              </h3>
              {Object.entries((frameworks as any)[formData.framework].fields).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {String(label)}
                  </label>
                  <TextareaAutosize
                    value={formData.fields[key] || ''}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                      }
                    }}
                    placeholder={`Enter ${String(label).toLowerCase()}`}
                    required
                    minRows={3}
                    maxRows={8}
                    aria-label={String(label)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>
              ))}
            </div>
          )}

          {formData.customTemplate && (
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-5 mt-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Custom Template</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template Content *
                </label>
                <TextareaAutosize
                  value={formData.fields.custom || ''}
                  onChange={(e) => handleFieldChange('custom', e.target.value)}
                  minRows={8}
                  maxRows={15}
                  placeholder="Enter your custom template here..."
                  required
                  aria-label="Custom template content"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400">
              {loading ? 'Creating...' : 'Save Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

