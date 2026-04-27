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
import { cn } from '~/utils';

// Predefined Personas
const PREDEFINED_PERSONAS = [
  {
    name: 'Financial Advisor',
    description: 'Provide investment, market, and personal finance guidance.',
    template: `Act as a financial advisor specializing in {{focus_area}}.

User financial context: {{user_context}}

Provide:

1. Market overview  

2. Recommended actions  

3. Risks involved  

4. Clear reasoning behind each step  

Keep the explanation simple and actionable.`,
    variables: ['focus_area', 'user_context'],
  },
  {
    name: 'Business Consultant',
    description: 'Offer strategic, operational, or profitability advice for businesses.',
    template: `Act as a business consultant focusing on {{business_domain}}.

Problem to analyze: {{problem_statement}}

Provide:

- Root cause analysis  

- Strategic recommendations  

- Impact on revenue/operations  

- Steps to execute`,
    variables: ['business_domain', 'problem_statement'],
  },
  {
    name: 'Research Assistant',
    description: 'Gather structured information and present concise findings.',
    template: `Act as a research assistant.

Research topic: {{topic}}

Provide:

- Short summary  

- Key findings  

- Comparisons (if applicable)  

- Useful insights`,
    variables: ['topic'],
  },
  {
    name: 'Report Generator',
    description: 'Convert raw text into a structured professional report.',
    template: `Generate a structured report from the following input:

{{input_data}}

Format:

- Executive Summary  

- Key Insights  

- Supporting Details  

- Recommendations`,
    variables: ['input_data'],
  },
  {
    name: 'Risk Analyst',
    description: 'Identify threats, vulnerabilities, and mitigation strategies.',
    template: `Act as a risk analyst.

Context: {{context}}

Provide:

- Identified risks  

- Probability & impact  

- Mitigation strategies  

- Priority level`,
    variables: ['context'],
  },
  {
    name: 'Marketing Strategist',
    description: 'Develop campaign ideas, positioning, and messaging.',
    template: `Act as a marketing strategist.

Goal: {{marketing_goal}}

Target audience: {{target_audience}}

Provide:

- Positioning  

- Messaging  

- Campaign ideas  

- CTA suggestions`,
    variables: ['marketing_goal', 'target_audience'],
  },
  {
    name: 'Technical Explainer',
    description: 'Explain complex concepts in simple, intuitive ways.',
    template: `Act as a technical explainer.

Topic: {{topic}}

Explain:

- What it is  

- How it works  

- Why it matters  

- Simple example`,
    variables: ['topic'],
  },
  {
    name: 'Summarizer',
    description: 'Produce concise, clear summaries.',
    template: `Summarize the following text:

{{text}}

Keep it:

- Concise  

- Clear  

- Covering only the essential points`,
    variables: ['text'],
  },
];

// Create Persona Modal
export default function CreatePersonaModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (persona: any) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    usePredefined: false,
    selectedPredefinedId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPredefinedMenuOpen, setIsPredefinedMenuOpen] = useState(false);

  // Handle predefined persona selection
  const handlePredefinedSelect = (predefinedId: string) => {
    const predefined = PREDEFINED_PERSONAS.find((_, idx) => idx.toString() === predefinedId);
    if (predefined) {
      setFormData({
        ...formData,
        name: predefined.name,
        description: predefined.template, // Fill description with persona template (with variables like {{focus_area}})
        selectedPredefinedId: predefinedId,
        // Template selection remains separate - user can select template or write custom
      });
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
      template_id: null,
      is_custom_template: false,
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
            'px-[var(--Gap-parentChild)] py-[var(--Padding-sibling)]',
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

        {/* Divider */}
        <div className="h-px w-full bg-fig-Stroke-soft" />

        {/* Body */}
        <div className="flex flex-col gap-[var(--Gap-parentChild)] px-[var(--Gap-parentChild)] py-[var(--Padding-sibling)]">
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
                        {formData.selectedPredefinedId
                          ? PREDEFINED_PERSONAS[parseInt(formData.selectedPredefinedId)].name
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
                    ...PREDEFINED_PERSONAS.map((persona, idx) => ({
                      label: persona.name,
                      onClick: () => {
                        handlePredefinedSelect(idx.toString());
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
                  {!formData.selectedPredefinedId && (
                    <span className="text-fig-Subject-danger"> *</span>
                  )}
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
                {formData.selectedPredefinedId && (
                  <p className="fy-typography-label-tiny text-fig-Subject-neutral">
                    {`Variables to edit: ${PREDEFINED_PERSONAS[parseInt(formData.selectedPredefinedId)]?.variables.map((v) => `{{${v}}}`).join(', ')}`}
                  </p>
                )}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-[var(--Gap-zero-neighbor)]">
              <Button
                type="submit"
                disabled={loading}
                className={cn(
                  'fy-typography-label-small h-[var(--Size-zero-button)] rounded-[2px]',
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
                  'fy-typography-label-small h-[var(--Size-zero-button)] rounded-[2px]',
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
