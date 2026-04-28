import * as Ariakit from '@ariakit/react';
import { useToastContext } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import CreateTemplateModal from '~/components/Templates/CreateTemplateModal';
import { saasApi } from '~/services/saasApi';
import { cn } from '~/utils';

interface SavedTemplate {
  name: string;
  description: string;
  detailedPrompt: string;
  framework?: string;
  content?: Record<string, any>;
}

export default function TemplateSelector() {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { conversationId } = useParams<{ conversationId?: string }>();
  const hasInitialized = useRef(false);
  const { showToast } = useToastContext();
  const menu = Ariakit.useMenuStore({ open: isOpen, setOpen: setIsOpen });

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[TemplateSelector] Fetching templates from backend...');
      const response = await saasApi.getTemplates();
      console.log('[TemplateSelector] Raw API response:', response);

      let templatesArray: any[] = [];
      if (response) {
        if (Array.isArray(response)) {
          templatesArray = response;
        } else {
          const responseAny = response as any;
          if (responseAny.data && Array.isArray(responseAny.data)) {
            templatesArray = responseAny.data;
          }
        }
      }

      if (templatesArray.length > 0) {
        const parsedTemplates: SavedTemplate[] = templatesArray.map((item: any) => {
          let detailedPrompt = '';
          if (item.content?.custom) {
            detailedPrompt =
              typeof item.content.custom === 'string'
                ? item.content.custom
                : JSON.stringify(item.content.custom);
          } else if (item.content && typeof item.content === 'string') {
            detailedPrompt = item.content;
          } else if (item.detailedPrompt) {
            detailedPrompt = item.detailedPrompt;
          } else if (item.description) {
            detailedPrompt = item.description;
          } else if (item.framework) {
            detailedPrompt = item.framework;
          }

          return {
            name: item.name || item.template || 'Unnamed Template',
            description: item.description || '',
            detailedPrompt: detailedPrompt || item.name || '',
            framework: item.framework || '',
            content: item.content || {},
          };
        });

        console.log('[TemplateSelector] Parsed templates:', parsedTemplates);
        setTemplates(parsedTemplates);
      } else {
        console.warn('[TemplateSelector] No templates found in response:', response);
        setTemplates([]);
      }
    } catch (error) {
      console.error('[TemplateSelector] Error fetching templates:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    const handleTemplatesListUpdate = () => {
      console.log('[TemplateSelector] Templates list updated, refetching...');
      fetchTemplates();
    };
    window.addEventListener('templatesListUpdated', handleTemplatesListUpdate);
    return () => {
      window.removeEventListener('templatesListUpdated', handleTemplatesListUpdate);
    };
  }, [fetchTemplates]);

  useEffect(() => {
    const convoId = conversationId || Constants.NEW_CONVO;
    loadTemplateFromStorage(convoId);

    const handleTemplateUpdate = () => {
      loadTemplateFromStorage(convoId);
    };

    window.addEventListener('templateUpdated', handleTemplateUpdate);
    return () => {
      window.removeEventListener('templateUpdated', handleTemplateUpdate);
    };
  }, [conversationId]);

  const loadTemplateFromStorage = useCallback((convoId: string) => {
    let templateData = localStorage.getItem(`template_data_${convoId}`);

    if (!templateData && convoId !== Constants.NEW_CONVO) {
      templateData = localStorage.getItem(`template_data_${Constants.NEW_CONVO}`);
    }

    if (templateData) {
      try {
        const data = JSON.parse(templateData);
        setSelectedTemplate(data.template || data.name || null);
      } catch (e) {
        setSelectedTemplate(null);
      }
    } else {
      setSelectedTemplate(null);
    }
  }, []);

  const handleSelectTemplate = async (template: SavedTemplate) => {
    const convoId = conversationId || Constants.NEW_CONVO;

    const templateData = {
      template: template.name,
      name: template.name,
      description: template.description || '',
      framework: template.framework || '',
      detailedPrompt: template.detailedPrompt || template.description || template.name,
      content: template.content || {
        custom: template.detailedPrompt || template.description || template.name,
      },
    };

    localStorage.setItem(`template_data_${convoId}`, JSON.stringify(templateData));
    window.dispatchEvent(new Event('templateUpdated'));
    setSelectedTemplate(template.name);
    console.log('✅ Template selected and stored:', template.name, templateData);
    setIsOpen(false);
  };

  const handleClearTemplate = () => {
    const convoId = conversationId || Constants.NEW_CONVO;
    localStorage.removeItem(`template_data_${convoId}`);
    if (convoId !== Constants.NEW_CONVO) {
      localStorage.removeItem(`template_data_${Constants.NEW_CONVO}`);
    }
    window.dispatchEvent(new Event('templateUpdated'));
    setSelectedTemplate(null);
    console.log('🗑️ Template cleared');
    setIsOpen(false);
  };

  const handleSaveNewTemplate = async (template: any) => {
    try {
      await saasApi.createTemplate(template);
      console.log('✅ New template created:', template);

      showToast({
        message: 'Template created',
        status: 'success',
      });

      const response = await saasApi.getTemplates();
      let templatesArray: any[] = [];
      if (response) {
        if (Array.isArray(response)) {
          templatesArray = response;
        } else {
          const responseAny = response as any;
          if (responseAny.data && Array.isArray(responseAny.data)) {
            templatesArray = responseAny.data;
          }
        }
      }

      if (templatesArray.length > 0) {
        const parsedTemplates: SavedTemplate[] = templatesArray.map((item: any) => {
          let detailedPrompt = '';
          if (item.content?.custom) {
            detailedPrompt =
              typeof item.content.custom === 'string'
                ? item.content.custom
                : JSON.stringify(item.content.custom);
          } else if (item.content && typeof item.content === 'string') {
            detailedPrompt = item.content;
          } else if (item.detailedPrompt) {
            detailedPrompt = item.detailedPrompt;
          } else if (item.description) {
            detailedPrompt = item.description;
          } else if (item.framework) {
            detailedPrompt = item.framework;
          }

          return {
            name: item.name || 'Unnamed Template',
            description: item.description || '',
            detailedPrompt: detailedPrompt || item.name || '',
            framework: item.framework || '',
            content: item.content || {},
          };
        });

        setTemplates(parsedTemplates);
      }

      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create template:', error);
      throw error;
    }
  };

  const uniqueTemplates = templates.filter(
    (t, idx, arr) => arr.findIndex((q) => q.name === t.name) === idx,
  );

  const buttonText = selectedTemplate
    ? `${selectedTemplate}`
    : templates.length > 0
      ? 'Pick Template'
      : 'No Templates';

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="flex h-[var(--Size-input)] items-center gap-1.5 rounded-[2px] border border-fig-Stroke-soft bg-transparent px-[var(--Padding-zero-spacer)] text-sm font-normal leading-5 text-fig-Subject-standard opacity-50"
      >
        <span>Loading...</span>
      </button>
    );
  }

  if (templates.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="flex h-[var(--Size-input)] items-center gap-1.5 rounded-[2px] border border-fig-Stroke-soft bg-transparent px-[var(--Padding-zero-spacer)] text-sm font-normal leading-5 text-fig-Subject-standard opacity-50"
        title="No templates available"
      >
        <span>{buttonText}</span>
      </button>
    );
  }

  return (
    <>
      <Ariakit.MenuProvider store={menu}>
        <Ariakit.MenuButton className="flex h-[var(--Size-input)] items-center gap-[var(--Gap-zero-group)] rounded-[2px] border border-fig-Stroke-soft bg-transparent px-[var(--Padding-zero-spacer)] text-sm font-normal leading-5 text-fig-Subject-standard transition-colors hover:bg-fig-Surface-one-standard">
          <img
            src="/research/assets/documents.svg"
            alt="Template"
            className="h-3.5 w-3.5 dark:invert"
          />
          <span>{buttonText}</span>
          <ChevronDown className="h-4 w-4" />
        </Ariakit.MenuButton>

        <Ariakit.Menu
          id="template-selector"
          gutter={0}
          portal={true}
          modal={true}
          unmountOnHide={true}
          className={cn(
            'z-50 flex flex-col overflow-hidden',
            'w-[198px]',
            'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
            'shadow-[0px_var(--Effects-Shadow-one-y,2px)_var(--Effects-one-blur,8px)_0px_var(--Shadow-standard,#ededed)]',
          )}
        >
          {/* "Select a template" section header */}
          <div className="shrink-0 bg-fig-Surface-one-standard p-[var(--Padding-zero-parentChild)]">
            <p className="fy-typography-title-tiny text-fig-Subject-standard">
              {'Select a template'}
            </p>
          </div>

          {/* Scrollable list */}
          <div className="max-h-[320px] overflow-y-auto">
            {uniqueTemplates.map((template) => (
              <button
                key={`template-${template.name}`}
                type="button"
                className={cn(
                  'fy-typography-label-small flex w-full cursor-pointer items-center',
                  'bg-fig-Surface-standard px-[var(--Padding-spacer)] py-[var(--Padding-boundary)]',
                  '!text-fig-Subject-standard outline-none',
                  'transition-colors hover:bg-fig-Surface-one-standard focus:bg-fig-Surface-one-standard',
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectTemplate(template);
                }}
              >
                {template.name}
              </button>
            ))}

            {uniqueTemplates.length === 0 && (
              <div className="fy-typography-body-small px-[var(--Padding-spacer)] py-[var(--Padding-boundary)] text-fig-Subject-soft">
                {'No templates found'}
              </div>
            )}

            {/* Create new template */}
            <button
              type="button"
              className={cn(
                'fy-typography-label-small flex w-full cursor-pointer items-center gap-[var(--Gap-zero-neighbor)]',
                'bg-fig-Surface-standard p-[var(--Padding-spacer)]',
                '!text-fig-Subject-standard outline-none',
                'transition-colors hover:bg-fig-Surface-one-standard focus:bg-fig-Surface-one-standard',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsOpen(false);
                setShowCreateModal(true);
              }}
            >
              {'Create new template'}
              <ChevronRight
                className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] shrink-0 text-fig-Subject-neutral"
                aria-hidden
              />
            </button>

            {/* Reset to default (when a template is selected) */}
            {selectedTemplate && (
              <>
                <button
                  type="button"
                  className={cn(
                    'fy-typography-label-small flex w-full cursor-pointer items-center',
                    'bg-fig-Surface-standard px-[var(--Padding-spacer)] py-[var(--Padding-boundary)]',
                    '!text-fig-Subject-standard outline-none',
                    'transition-colors hover:bg-fig-Surface-one-standard focus:bg-fig-Surface-one-standard',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleClearTemplate();
                  }}
                >
                  {'Clear template'}
                </button>
              </>
            )}
          </div>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>

      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleSaveNewTemplate}
        />
      )}
    </>
  );
}
