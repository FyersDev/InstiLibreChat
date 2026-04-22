import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import { DropdownPopup, useToastContext } from '@librechat/client';
import { saasApi } from '~/services/saasApi';
import { useParams, useNavigate } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import CreateTemplateModal from '~/components/Templates/CreateTemplateModal';

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
  const navigate = useNavigate();
  const hasInitialized = useRef(false);
  const { showToast } = useToastContext();

  // Function to fetch templates from API
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[TemplateSelector] Fetching templates from backend...');
      const response = await saasApi.getTemplates();
      console.log('[TemplateSelector] Raw API response:', response);
      
      // Handle paginated response format: {data: Array, page, limit, total, total_pages}
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
          // Try multiple fields to get detailedPrompt
          let detailedPrompt = '';
          if (item.content?.custom) {
            detailedPrompt = typeof item.content.custom === 'string' 
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
            content: item.content || {}
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

  // Fetch templates once on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    fetchTemplates();
  }, [fetchTemplates]);

  // Listen for template list changes (created/deleted)
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

  // Load and sync selected template - only when conversationId changes
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
    
    // Fallback to NEW_CONVO if current convo doesn't have data (handles migration timing)
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
    
    // Store template data
    const templateData = {
      template: template.name,
      name: template.name,
      description: template.description || '',
      framework: (template as any).framework || '',
      detailedPrompt: template.detailedPrompt || template.description || template.name,
      content: (template as any).content || { custom: template.detailedPrompt || template.description || template.name }
    };
    localStorage.setItem(`template_data_${convoId}`, JSON.stringify(templateData));
    // Dispatch custom event to notify other components (like SelectedTemplate)
    window.dispatchEvent(new Event('templateUpdated'));
    setSelectedTemplate(template.name);
    console.log('✅ Template selected and stored:', template.name, templateData);
    setIsOpen(false);
  };

  const handleClearTemplate = () => {
    const convoId = conversationId || Constants.NEW_CONVO;
    // Clear from both actual conversationId and NEW_CONVO to ensure it's removed
    localStorage.removeItem(`template_data_${convoId}`);
    if (convoId !== Constants.NEW_CONVO) {
      localStorage.removeItem(`template_data_${Constants.NEW_CONVO}`);
    }
    // Dispatch custom event to notify other components
    window.dispatchEvent(new Event('templateUpdated'));
    setSelectedTemplate(null);
    console.log('🗑️ Template cleared');
    setIsOpen(false);
  };

  const formatTemplateContent = (content: string): string => {
    // Split by lines and extract key parts
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return content;
    
    // Try to extract ROLE, TASK, FORMAT from the structure
    let role = '';
    let task = '';
    let format = '';
    
    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('role') || lowerLine.includes('act as')) {
        role = line.replace(/.*(?:role|act as)[:\s]*/i, '').trim();
      } else if (lowerLine.includes('task') || lowerLine.includes('create')) {
        task = line.replace(/.*(?:task|create)[:\s]*/i, '').trim();
      } else if (lowerLine.includes('format') || lowerLine.includes('show as')) {
        format = line.replace(/.*(?:format|show as)[:\s]*/i, '').trim();
      }
    });
    
    // Build compact display
    const parts: string[] = [];
    if (role) parts.push(`Role: ${role.substring(0, 20)}`);
    if (task) parts.push(`Task: ${task.substring(0, 30)}`);
    if (format) parts.push(`Format: ${format}`);
    
    if (parts.length > 0) {
      return parts.join(' | ');
    }
    
    // Fallback: show first line or truncated content
    return lines[0]?.substring(0, 50) || content.substring(0, 50);
  };

  const getIsTemplateSelected = (template: SavedTemplate): boolean => {
    const convoId = conversationId || Constants.NEW_CONVO;
    let templateDataStr = localStorage.getItem(`template_data_${convoId}`);
    
    if (!templateDataStr && convoId !== Constants.NEW_CONVO) {
      templateDataStr = localStorage.getItem(`template_data_${Constants.NEW_CONVO}`);
    }
    
    if (templateDataStr) {
      try {
        const templateData = JSON.parse(templateDataStr);
        return (templateData.template || templateData.name) === template.name;
      } catch (e) {
        return false;
      }
    }
    
    return false;
  };

  const menuItems = [
    ...templates.map((template) => {
      const isSelected = getIsTemplateSelected(template);
      
      return {
        label: template.name,
        onClick: () => handleSelectTemplate(template),
        key: `template-${template.name}`,
      };
    }),
    {
      separate: true,
      key: 'separator-create',
    },
    {
      label: 'Create New Template',
      onClick: () => {
        setIsOpen(false);
        setShowCreateModal(true);
      },
      key: 'create-template',
    },
    ...(selectedTemplate ? [{
      separate: true,
      key: 'separator',
    }, {
      label: 'Reset to default',
      onClick: handleClearTemplate,
      key: 'clear-template',
    }] : []),
  ];

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="flex h-8 items-center gap-1.5 rounded-[2px] border border-fig-Stroke-soft bg-transparent px-1.5 text-sm font-normal leading-5 text-fig-Text-body opacity-50"
      >
        <img src="/research/assets/documents.svg" alt="Template" className="h-3.5 w-3.5 dark:invert" />
        <span>Loading...</span>
      </button>
    );
  }

  const buttonText = selectedTemplate 
    ? `${selectedTemplate}` 
    : templates.length > 0 
      ? 'Pick Template' 
      : 'No Templates';

  if (menuItems.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="flex h-8 items-center gap-1.5 rounded-[2px] border border-fig-Stroke-soft bg-transparent px-1.5 text-sm font-normal leading-5 text-fig-Text-body opacity-50"
        title="No templates available"
      >
        <img src="/research/assets/documents.svg" alt="Template" className="h-3.5 w-3.5 dark:invert" />
        <span>{buttonText}</span>
      </button>
    );
  }

  const handleSaveNewTemplate = async (template: any) => {
    try {
      await saasApi.createTemplate(template);
      console.log('✅ New template created:', template);
      
      // Show success toast
      showToast({
        message: 'Template created',
        status: 'success',
      });
      
      // Refresh templates list
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
          if (item.content) {
            if (item.content.custom) {
              detailedPrompt = item.content.custom;
            } else {
              detailedPrompt = Object.values(item.content).join('\n\n');
            }
          } else if (item.framework) {
            detailedPrompt = item.framework;
          }
          
          return {
            name: item.name || 'Unnamed Template',
            description: item.description || '',
            detailedPrompt: detailedPrompt || item.name || '',
            framework: item.framework || '',
            content: item.content || {}
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

  return (
    <>
      <DropdownPopup
        portal={true}
        modal={true}
        sameWidth={false}
        gutter={4}
        anchor={{ x: 'start', y: 'bottom' }}
        menuId="template-selector"
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        trigger={
          <Ariakit.MenuButton
            className="flex h-8 items-center gap-1.5 rounded-[2px] border border-fig-Stroke-soft bg-transparent px-1.5 text-sm font-normal leading-5 text-fig-Text-body transition-colors hover:bg-fig-Surface-one-standard"
          >
            <img src="/research/assets/documents.svg" alt="Template" className="h-3.5 w-3.5 dark:invert" />
            <span>{buttonText}</span>
            <ChevronDown className="h-4 w-4" />
          </Ariakit.MenuButton>
        }
        items={menuItems}
        className="w-auto max-w-[280px] max-h-[400px] overflow-y-auto rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2"
        itemClassName="px-4 py-3 text-base hover:bg-gray-100 dark:hover:bg-gray-700"
      />
      
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleSaveNewTemplate}
        />
      )}
    </>
  );
}