import { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, TextareaAutosize, DropdownPopup } from '@librechat/client';
import { ChevronDown } from 'lucide-react';

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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Create Agents</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name *</label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Predefined Personas - Above description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Predefined Agent (optional)
            </label>
            <div className="relative">
              <DropdownPopup
                portal={false}
                sameWidth={true}
                anchor={{ x: 'start', y: 'bottom' }}
                menuId="predefined-agent-selector-create"
                isOpen={isPredefinedMenuOpen}
                setIsOpen={setIsPredefinedMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    style={{ height: '40px' }}
                    className="w-full flex items-center justify-between gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm font-normal text-gray-900 dark:text-gray-100 transition-all hover:border-gray-400 dark:hover:border-gray-500"
                  >
                    <span>
                      {formData.selectedPredefinedId 
                        ? PREDEFINED_PERSONAS[parseInt(formData.selectedPredefinedId)].name
                        : '-- Select Predefined Agent (Optional) --'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Ariakit.MenuButton>
                }
                items={[
                  {
                    label: '-- Select Predefined Agent (Optional) --',
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
                className="w-full rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
            {formData.selectedPredefinedId && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Agent template will be auto-filled below. Just edit the variables like {`{{variable_name}}`} with your values.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description {formData.selectedPredefinedId ? '' : '*'}
            </label>
            <TextareaAutosize
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              minRows={5}
              maxRows={10}
              required={!formData.selectedPredefinedId}
              aria-label="Persona description"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              placeholder={formData.selectedPredefinedId ? "Edit variables like {{focus_area}} with your values" : "Enter persona description..."}
            />
            {formData.selectedPredefinedId && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Variables to edit: {PREDEFINED_PERSONAS[parseInt(formData.selectedPredefinedId)]?.variables.map(v => `{{${v}}}`).join(', ')}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              {loading ? 'Creating...' : 'Save Agents'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

