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
import { useState } from 'react';
import { usePredefinedResearchCatalog } from '~/hooks/usePredefinedResearchCatalog';
import { cn } from '~/utils';

export default function CreatePersonaModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (persona: any) => Promise<void>;
}) {
  const { agents: predefinedAgents, loading: catalogLoading, error: catalogError } =
    usePredefinedResearchCatalog();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    usePredefined: false,
    /** FYERS predefined agent UUID, or '' */
    selectedPredefinedId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPredefinedMenuOpen, setIsPredefinedMenuOpen] = useState(false);

  const selectedAgent = predefinedAgents.find((a) => a.agentId === formData.selectedPredefinedId);

  const handlePredefinedSelect = (agentId: string) => {
    if (!agentId) {
      setFormData((prev) => ({ ...prev, selectedPredefinedId: '' }));
      return;
    }
    const agent = predefinedAgents.find((a) => a.agentId === agentId);
    if (agent) {
      setFormData((prev) => ({
        ...prev,
        name: agent.name,
        description: agent.template,
        selectedPredefinedId: agentId,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Persona name is required');
      return;
    }
    // Description is optional when using predefined persona (auto-filled)
    if (!formData.selectedPredefinedId && !formData.description.trim()) {
      setError('Description is required');
      return;
    }
    const persona = {
      name: formData.name,
      description: formData.description || null,
      is_custom_template: true,
      content: {},
    };

    setLoading(true);
    try {
      await onSave(persona);
      onClose();
    } catch (error: any) {
      setError(error.message || 'Failed to create agent');
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
          'shadow-none',
          'text-fig-Subject-standard',
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
              Create agent
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'inline-flex h-[var(--Size-icon)] w-[var(--Size-icon)] items-center justify-center',
                'rounded-[var(--Corner-moderatelyRounded)] text-fig-Subject-standard transition-colors',
                'hover:bg-fig-Surface-neutral',
                'focus:outline-none focus-visible:ring-fig-Stroke-primary',
              )}
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-col gap-[var(--Gap-parentChild)] px-[var(--Gap-parentChild)] py-[var(--Gap-parentChild)]">
          {(error || catalogError) && (
            <div
              className={cn(
                'fy-typography-body-small',
                'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                'bg-fig-Surface-one-danger px-[var(--Padding-zero-neighbor)] py-[var(--Padding-zero-buddy)]',
                'text-fig-Subject-danger',
              )}
            >
              {error || catalogError}
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
              {/* Name field */}
              <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                <label className="fy-typography-label-small text-fig-Subject-neutral">
                  Name of the agent
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Example: Research assistant"
                  className={cn(
                    'fy-typography-body-small h-[var(--Size-zero-button)] w-full',
                    'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                    '!bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] !text-fig-Subject-standard',
                    'placeholder:!text-fig-Subject-soft',
                    'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
                    'transition-colors duration-200',
                  )}
                />
              </div>

              {/* Predefined agent dropdown */}
              <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                <label className="fy-typography-label-small text-fig-Subject-neutral">
                  Select pre-defined agent (Optional)
                </label>
                <DropdownPopup
                  portal={false}
                  sameWidth={true}
                  anchor={{ x: 'start', y: 'bottom' }}
                  menuId="predefined-agent-selector-create"
                  isOpen={isPredefinedMenuOpen}
                  setIsOpen={setIsPredefinedMenuOpen}
                  trigger={
                    <Ariakit.MenuButton
                      className={cn(
                        'fy-typography-body flex h-[var(--Size-zero-button)] w-full items-center justify-between',
                        'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                        'px-[var(--Padding-zero-spacer)] text-fig-Subject-standard',
                        'transition-colors hover:border-fig-Stroke-standard',
                      )}
                    >
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis text-left">
                        {catalogLoading
                          ? 'Loading agents…'
                          : selectedAgent
                            ? selectedAgent.name
                            : 'None'}
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
                        handlePredefinedSelect('');
                        setIsPredefinedMenuOpen(false);
                      },
                    },
                    ...predefinedAgents.map((agent) => ({
                      label: agent.name,
                      onClick: () => {
                        handlePredefinedSelect(agent.agentId);
                        setIsPredefinedMenuOpen(false);
                      },
                    })),
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
                {formData.selectedPredefinedId && (
                  <p className="fy-typography-label-tiny text-fig-Subject-primary">
                    {`Agent template auto-filled. Edit variables like {{variable_name}} with your values.`}
                  </p>
                )}
              </div>

              {/* Description field */}
              <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                <label className="fy-typography-label-small text-fig-Subject-neutral">
                  Description
                </label>
                <TextareaAutosize
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  minRows={3}
                  maxRows={8}
                  required={!formData.selectedPredefinedId}
                  aria-label="Persona description"
                  className={cn(
                    'fy-typography-body-small w-full resize-none',
                    'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                    'bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] py-[var(--Padding-zero-buddy)]',
                    'text-fig-Subject-standard placeholder:text-fig-Subject-soft',
                    'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
                    'transition-colors duration-200',
                  )}
                  placeholder={
                    formData.selectedPredefinedId
                      ? `Edit variables like {{focus_area}} with your values`
                      : `Example: Conduct a deep research on the company and provide key findings.`
                  }
                />
                {formData.selectedPredefinedId && selectedAgent?.variables?.length ? (
                  <p className="fy-typography-label-tiny text-fig-Subject-neutral">
                    {`Variables to edit: ${selectedAgent.variables.map((v) => `{{${v}}}`).join(', ')}`}
                  </p>
                ) : null}
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
                Dismiss
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
