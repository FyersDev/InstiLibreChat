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
  useToastContext,
} from '@librechat/client';
import { ChevronDown, Edit, MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { saasApi } from '~/services/saasApi';
import { asset } from '~/utils/assetPath';

export default function TemplatesView() {
  const { showToast } = useToastContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'personas' | 'templates'>('personas');
  const [templates, setTemplates] = useState<any[]>([]);
  const [personas, setPersonas] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
    type: 'template' | 'persona';
    id: string;
  } | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [showCreatePersonaModal, setShowCreatePersonaModal] = useState(false);
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
  const [showEditPersonaModal, setShowEditPersonaModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedPersona, setSelectedPersona] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchPersonas();
  }, []);

  // Handle query parameters for opening create modals
  useEffect(() => {
    const tab = searchParams.get('tab');
    const action = searchParams.get('action');

    // Only update tab if explicitly set in URL
    if (tab === 'personas') {
      setActiveTab('personas');
    } else if (tab === 'templates') {
      setActiveTab('templates');
    }

    // Only open modal if action is 'create' AND we're not already showing a modal
    if (
      action === 'create' &&
      !showCreateTemplateModal &&
      !showCreatePersonaModal &&
      !showEditTemplateModal &&
      !showEditPersonaModal
    ) {
      const currentTab = tab || activeTab;
      if (currentTab === 'personas') {
        setShowCreatePersonaModal(true);
      } else {
        setShowCreateTemplateModal(true);
      }
      // Clear the action parameter after opening modal
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const data = await saasApi.getTemplates();
      // Handle null response or various response formats
      if (!data) {
        setTemplates([]);
        return;
      }
      const templatesList = Array.isArray((data as any).data)
        ? (data as any).data
        : Array.isArray(data)
          ? data
          : (data as any).data || [];
      setTemplates(templatesList);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates([]); // Set empty array on error
    } finally {
      setTemplatesLoading(false);
    }
  };

  const fetchPersonas = async () => {
    setPersonasLoading(true);
    try {
      const data = await saasApi.getPersonas();
      // Handle null response or various response formats
      if (!data) {
        setPersonas([]);
        return;
      }
      const personasList = Array.isArray((data as any).data)
        ? (data as any).data
        : Array.isArray(data)
          ? data
          : (data as any).data || [];
      setPersonas(personasList);
    } catch (error) {
      console.error('Error fetching personas:', error);
      setPersonas([]); // Set empty array on error
    } finally {
      setPersonasLoading(false);
    }
  };

  const saveTemplate = async (template: any) => {
    try {
      if (template.id) {
        await saasApi.updateTemplate(template.id, template);
        showToast({
          message: `Template "${template.name}" updated successfully`,
          status: 'success',
        });
      } else {
        await saasApi.createTemplate(template);
        showToast({
          message: `Template "${template.name}" created successfully`,
          status: 'success',
        });
      }
      await fetchTemplates();
      // Notify other components that templates list has changed
      window.dispatchEvent(new Event('templatesListUpdated'));
    } catch (error: any) {
      showToast({
        message:
          error.message ||
          (template.id ? 'Failed to update Template' : 'Failed to create Template'),
        status: 'error',
      });
      throw error;
    }
  };

  const savePersona = async (persona: any) => {
    try {
      if (persona.id) {
        await saasApi.updatePersona(persona.id, persona);
        showToast({
          message: `Agent "${persona.name}" updated successfully`,
          status: 'success',
        });
      } else {
        await saasApi.createPersona(persona);
        showToast({
          message: `Agent "${persona.name}" created successfully`,
          status: 'success',
        });
      }
      await fetchPersonas();
      // Notify other components that personas list has changed
      window.dispatchEvent(new Event('personasListUpdated'));
    } catch (error: any) {
      showToast({
        message:
          error.message || (persona.id ? 'Failed to update Agent' : 'Failed to create Agent'),
        status: 'error',
      });
      throw error;
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      // Find the template being deleted to check if it's currently selected
      const templateToDelete = templates.find((t) => t.id === id);

      await saasApi.deleteTemplate(id);
      showToast({
        message: 'Template deleted successfully',
        status: 'success',
      });

      // Clear the deleted template from localStorage if it's currently selected
      if (templateToDelete) {
        // Check all possible conversation IDs in localStorage
        const keys = Object.keys(localStorage);
        const templateKeys = keys.filter((key) => key.startsWith('template_data_'));

        templateKeys.forEach((key) => {
          try {
            const storedData = localStorage.getItem(key);
            if (storedData) {
              const templateData = JSON.parse(storedData);
              // Check if this is the deleted template
              if (
                templateData.template === templateToDelete.name ||
                templateData.name === templateToDelete.name
              ) {
                // Clear it from localStorage
                localStorage.removeItem(key);
                console.log(`🗑️ Cleared deleted template "${templateToDelete.name}" from ${key}`);
              }
            }
          } catch (e) {
            console.error('Error checking template data:', e);
          }
        });

        // Dispatch event to notify all components that template was updated/removed
        window.dispatchEvent(new Event('templateUpdated'));
      }
    } catch (error: any) {
      showToast({
        message: error.message || 'Failed to delete template',
        status: 'error',
      });
    } finally {
      // Always refresh the list, even if deletion fails
      await fetchTemplates();
      // Notify other components that templates list has changed
      window.dispatchEvent(new Event('templatesListUpdated'));
    }
  };

  const deletePersona = async (id: string) => {
    try {
      // Find the persona being deleted to check if it's currently selected
      const personaToDelete = personas.find((p) => p.id === id);

      await saasApi.deletePersona(id);
      showToast({
        message: 'Agent deleted successfully',
        status: 'success',
      });

      // Clear the deleted persona from localStorage if it's currently selected
      if (personaToDelete) {
        // Check all possible conversation IDs in localStorage
        const keys = Object.keys(localStorage);
        const personaKeys = keys.filter((key) => key.startsWith('persona_data_'));

        personaKeys.forEach((key) => {
          try {
            const storedData = localStorage.getItem(key);
            if (storedData) {
              const personaData = JSON.parse(storedData);
              // Check if this is the deleted persona
              if (
                personaData.persona === personaToDelete.name ||
                personaData.name === personaToDelete.name
              ) {
                // Clear it from localStorage
                localStorage.removeItem(key);
                console.log(`🗑️ Cleared deleted persona "${personaToDelete.name}" from ${key}`);
              }
            }
          } catch (e) {
            console.error('Error checking persona data:', e);
          }
        });

        // Dispatch event to notify all components that persona was updated/removed
        window.dispatchEvent(new Event('personaUpdated'));
      }
    } catch (error: any) {
      showToast({
        message: error.message || 'Failed to delete persona',
        status: 'error',
      });
    } finally {
      // Always refresh the list, even if deletion fails
      await fetchPersonas();
      // Notify other components that personas list has changed
      window.dispatchEvent(new Event('personasListUpdated'));
    }
  };

  const handleEditTemplate = (template: any) => {
    setSelectedTemplate(template);
    setShowEditTemplateModal(true);
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const handleEditPersona = (persona: any) => {
    setSelectedPersona(persona);
    setShowEditPersonaModal(true);
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const handleDeleteTemplate = async (template: any) => {
    if (window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      setDeleting(true);
      try {
        await deleteTemplate(template.id);
      } catch (error: any) {
        console.error('Error deleting template:', error);
        alert(error.message || 'Failed to delete template');
      } finally {
        setDeleting(false);
      }
    }
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const handleDeletePersona = async (persona: any) => {
    if (window.confirm(`Are you sure you want to delete "${persona.name}"?`)) {
      setDeleting(true);
      try {
        await deletePersona(persona.id);
      } catch (error: any) {
        console.error('Error deleting persona:', error);
        // Error toast is already shown in deletePersona
      } finally {
        setDeleting(false);
      }
    }
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!selectedItem) {
      setDropdownPosition(null);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('.dropdown-trigger') ||
        target.closest('[role="dialog"]') ||
        target.closest('.modal') ||
        showCreateTemplateModal ||
        showCreatePersonaModal ||
        showEditTemplateModal ||
        showEditPersonaModal
      ) {
        return;
      }
      if (target.closest('.fixed.w-48')) {
        return;
      }
      setSelectedItem(null);
      setDropdownPosition(null);
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [
    selectedItem,
    showCreateTemplateModal,
    showCreatePersonaModal,
    showEditTemplateModal,
    showEditPersonaModal,
  ]);

  const currentItems = activeTab === 'templates' ? templates : personas;
  const isLoading = activeTab === 'templates' ? templatesLoading : personasLoading;

  return (
    <div className="flex h-screen flex-col bg-[#ffffff] px-2 pb-2 pt-0 dark:bg-[#111111]">
      {/* Tabs */}
      <div className="pt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 sm:gap-4">
            <button
              onClick={() => {
                setActiveTab('personas');
                setSelectedItem(null);
                setDropdownPosition(null);
              }}
              className={`inline-flex h-7 items-center border-b-2 px-0 text-[14px] font-normal leading-none transition-colors ${
                activeTab === 'personas'
                  ? 'border-[#2434E7] text-[#2A2A2A] dark:text-gray-100'
                  : 'border-transparent text-[#6D6D6D] hover:text-[#2A2A2A] dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Agents
            </button>
            <button
              onClick={() => {
                setActiveTab('templates');
                setSelectedItem(null);
                setDropdownPosition(null);
              }}
              className={`inline-flex h-7 items-center border-b-2 px-0 text-[14px] font-normal leading-none transition-colors ${
                activeTab === 'templates'
                  ? 'border-[#2434E7] text-[#2A2A2A] dark:text-gray-100'
                  : 'border-transparent text-[#6D6D6D] hover:text-[#2A2A2A] dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Templates
            </button>
          </div>
          <Button
            onClick={() => {
              if (activeTab === 'templates') {
                setShowCreateTemplateModal(true);
              } else {
                setShowCreatePersonaModal(true);
              }
            }}
            className="h-8 rounded-lg bg-[#2434E7] px-4 py-2 font-medium text-white hover:bg-[#2434E7]/90"
          >
            + Create {activeTab === 'templates' ? 'template' : 'agent'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto py-4">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400">Loading...</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center">
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              No {activeTab === 'templates' ? 'templates' : 'agents'} created yet.
            </p>
            <Button
              onClick={() => {
                if (activeTab === 'templates') {
                  setShowCreateTemplateModal(true);
                } else {
                  setShowCreatePersonaModal(true);
                }
              }}
              className="h-8 rounded-lg bg-[#2434E7] px-4 py-2 font-medium text-white hover:bg-[#2434E7]/90"
            >
              + Create {activeTab === 'templates' ? 'template' : 'agent'}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full border-separate border-spacing-0">
              <thead className="border-b border-[#ededed] bg-[#EDEDED] dark:border-[#3e3e3e] dark:bg-[#2a2a2a]">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="whitespace-nowrap px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Short description
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Date created
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {activeTab === 'templates'
                  ? templates.map((template, rowIndex) => {
                      const isSelected =
                        selectedItem?.type === 'template' && selectedItem.id === template.id;
                      return (
                        <tr
                          key={template.id}
                          className={`group cursor-pointer hover:bg-[#f7f7f7] dark:hover:bg-[#222222] ${
                            rowIndex % 2 === 0
                              ? 'bg-[#ffffff] dark:bg-[#111111]'
                              : 'bg-[#fafafa] dark:bg-[#1a1a1a]'
                          }`}
                        >
                          <td className="whitespace-nowrap px-3 py-3">
                            <div className="flex items-center gap-3">
                              <div className="box-border flex h-[28px] min-h-[28px] w-[28px] min-w-[28px] shrink-0 items-center justify-center !rounded-[2px] border-0 bg-[#f7f7f7] p-1 dark:bg-[#222222]">
                                <img
                                  src={asset('documents.svg')}
                                  alt="Template"
                                  className="block h-full w-full max-h-[20px] max-w-[20px] flex-shrink-0 object-contain opacity-70 dark:opacity-70 dark:brightness-0 dark:invert"
                                />
                              </div>
                              <div className="text-sm font-normal text-gray-700 dark:text-gray-300">
                                {template.name}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="max-w-md whitespace-pre-wrap text-sm text-gray-500 dark:text-gray-400">
                              {(() => {
                                const templateContent =
                                  template.detailedPrompt || template.description || '';
                                if (!templateContent)
                                  return template.framework || 'No template content';

                                // Format template content to show structure (Role, Task, Format)
                                const lines = templateContent
                                  .split('\n')
                                  .filter((line) => line.trim());
                                if (lines.length === 0) return templateContent;

                                // Extract ROLE, TASK, FORMAT from the structure
                                let role = '';
                                let task = '';
                                let format = '';

                                lines.forEach((line) => {
                                  const lowerLine = line.toLowerCase();
                                  if (lowerLine.includes('role') || lowerLine.includes('act as')) {
                                    role = line.replace(/.*(?:role|act as)[:\s]*/i, '').trim();
                                  } else if (
                                    lowerLine.includes('task') ||
                                    lowerLine.includes('create')
                                  ) {
                                    task = line.replace(/.*(?:task|create)[:\s]*/i, '').trim();
                                  } else if (
                                    lowerLine.includes('format') ||
                                    lowerLine.includes('show as')
                                  ) {
                                    format = line.replace(/.*(?:format|show as)[:\s]*/i, '').trim();
                                  }
                                });

                                // Build formatted display showing the structure
                                if (role || task || format) {
                                  const parts: string[] = [];
                                  if (role) parts.push(`Role: ${role}`);
                                  if (task) parts.push(`Task: ${task}`);
                                  if (format) parts.push(`Format: ${format}`);
                                  return parts.join('\n');
                                }

                                // Fallback: show the full content (truncated if too long)
                                return templateContent.length > 200
                                  ? `${templateContent.substring(0, 200)}...`
                                  : templateContent;
                              })()}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(template.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm">
                            <div className="relative inline-block text-left">
                              <button
                                ref={(el) => {
                                  if (el) {
                                    buttonRefs.current.set(`template-${template.id}`, el);
                                  } else {
                                    buttonRefs.current.delete(`template-${template.id}`);
                                  }
                                }}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const isCurrentlySelected =
                                    selectedItem?.type === 'template' &&
                                    selectedItem.id === template.id;
                                  if (isCurrentlySelected) {
                                    setSelectedItem(null);
                                    setDropdownPosition(null);
                                  } else {
                                    const button = buttonRefs.current.get(
                                      `template-${template.id}`,
                                    );
                                    if (button) {
                                      const rect = button.getBoundingClientRect();
                                      setDropdownPosition({
                                        top: rect.bottom + 4,
                                        right: window.innerWidth - rect.right,
                                      });
                                    }
                                    setSelectedItem({ type: 'template', id: template.id });
                                  }
                                }}
                                className="dropdown-trigger rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                                title="More options"
                              >
                                <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              </button>
                              {isSelected &&
                                dropdownPosition &&
                                createPortal(
                                  <div
                                    className="fixed z-[9999] w-48 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                                    style={{
                                      top: `${dropdownPosition.top}px`,
                                      right: `${dropdownPosition.right}px`,
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="py-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          handleEditTemplate(template);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                      >
                                        <Edit className="h-4 w-4" />
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          handleDeleteTemplate(template);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-700"
                                      >
                                        <img
                                          src={asset('delete.svg')}
                                          alt="Delete"
                                          className="h-4 w-4 opacity-70 dark:opacity-70 dark:brightness-0 dark:invert"
                                        />
                                        Delete
                                      </button>
                                    </div>
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  : personas.map((persona, rowIndex) => {
                      const isSelected =
                        selectedItem?.type === 'persona' && selectedItem.id === persona.id;
                      return (
                        <tr
                          key={persona.id}
                          className={`group cursor-pointer hover:bg-[#f7f7f7] dark:hover:bg-[#222222] ${
                            rowIndex % 2 === 0
                              ? 'bg-[#ffffff] dark:bg-[#111111]'
                              : 'bg-[#fafafa] dark:bg-[#1a1a1a]'
                          }`}
                        >
                          <td className="whitespace-nowrap px-3 py-3">
                            <div className="flex items-center gap-3">
                              <div className="box-border flex h-[28px] min-h-[28px] w-[28px] min-w-[28px] shrink-0 items-center justify-center !rounded-[2px] border-0 bg-[#f7f7f7] p-1 dark:bg-[#222222]">
                                <img
                                  src={asset('Leads.svg')}
                                  alt="Persona"
                                  className="block h-full w-full max-h-[20px] max-w-[20px] flex-shrink-0 object-contain opacity-80 dark:invert"
                                />
                              </div>
                              <div className="text-sm font-normal text-gray-700 dark:text-gray-300">
                                {persona.name}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {persona.description || 'No description'}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(persona.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm">
                            <div className="relative inline-block text-left">
                              <button
                                ref={(el) => {
                                  if (el) {
                                    buttonRefs.current.set(`persona-${persona.id}`, el);
                                  } else {
                                    buttonRefs.current.delete(`persona-${persona.id}`);
                                  }
                                }}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const isCurrentlySelected =
                                    selectedItem?.type === 'persona' &&
                                    selectedItem.id === persona.id;
                                  if (isCurrentlySelected) {
                                    setSelectedItem(null);
                                    setDropdownPosition(null);
                                  } else {
                                    const button = buttonRefs.current.get(`persona-${persona.id}`);
                                    if (button) {
                                      const rect = button.getBoundingClientRect();
                                      setDropdownPosition({
                                        top: rect.bottom + 4,
                                        right: window.innerWidth - rect.right,
                                      });
                                    }
                                    setSelectedItem({ type: 'persona', id: persona.id });
                                  }
                                }}
                                className="dropdown-trigger rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                                title="More options"
                              >
                                <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              </button>
                              {isSelected &&
                                dropdownPosition &&
                                createPortal(
                                  <div
                                    className="fixed z-[9999] w-48 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                                    style={{
                                      top: `${dropdownPosition.top}px`,
                                      right: `${dropdownPosition.right}px`,
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="py-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          handleEditPersona(persona);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                      >
                                        <Edit className="h-4 w-4" />
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          handleDeletePersona(persona);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-700"
                                      >
                                        <img
                                          src={asset('delete.svg')}
                                          alt="Delete"
                                          className="h-4 w-4 opacity-70 dark:opacity-70 dark:brightness-0 dark:invert"
                                        />
                                        Delete
                                      </button>
                                    </div>
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}

      {/* Create Template Modal */}
      {showCreateTemplateModal && (
        <CreateTemplateModal
          onClose={() => {
            setShowCreateTemplateModal(false);
            setSelectedItem(null);
            setDropdownPosition(null);
          }}
          onSave={async (template) => {
            try {
              await saveTemplate(template);
              // First close modal
              setShowCreateTemplateModal(false);
              // Then switch tab and clear state
              setActiveTab('templates');
              setSelectedItem(null);
              setDropdownPosition(null);
            } catch (error) {
              // Error is handled in modal
            }
          }}
        />
      )}

      {/* Edit Template Modal */}
      {showEditTemplateModal && selectedTemplate && (
        <EditTemplateModal
          template={selectedTemplate}
          onClose={() => {
            setShowEditTemplateModal(false);
            setSelectedTemplate(null);
            setSelectedItem(null);
            setDropdownPosition(null);
          }}
          onSave={async (template) => {
            try {
              await saveTemplate({ ...template, id: selectedTemplate.id });
              setShowEditTemplateModal(false);
              setSelectedTemplate(null);
              setActiveTab('templates');
              setSelectedItem(null);
              setDropdownPosition(null);
            } catch (error) {
              // Error is handled in modal
            }
          }}
        />
      )}

      {/* Create Persona Modal */}
      {showCreatePersonaModal && (
        <CreatePersonaModal
          onClose={() => {
            setShowCreatePersonaModal(false);
            setSelectedItem(null);
            setDropdownPosition(null);
          }}
          onSave={async (persona) => {
            try {
              await savePersona(persona);
              // First close modal
              setShowCreatePersonaModal(false);
              // Then switch tab and clear state
              setActiveTab('personas');
              setSelectedItem(null);
              setDropdownPosition(null);
            } catch (error) {
              // Error is handled in modal
            }
          }}
        />
      )}

      {/* Edit Persona Modal */}
      {showEditPersonaModal && selectedPersona && (
        <EditPersonaModal
          persona={selectedPersona}
          onClose={() => {
            setShowEditPersonaModal(false);
            setSelectedPersona(null);
            setSelectedItem(null);
            setDropdownPosition(null);
          }}
          onSave={async (persona) => {
            try {
              await savePersona({ ...persona, id: selectedPersona.id });
              setShowEditPersonaModal(false);
              setSelectedPersona(null);
              setActiveTab('personas');
              setSelectedItem(null);
              setDropdownPosition(null);
            } catch (error) {
              // Error is handled in modal
            }
          }}
        />
      )}

      {showCreatePersonaModal && (
        <CreatePersonaModal
          onClose={() => setShowCreatePersonaModal(false)}
          onSave={async (persona) => {
            try {
              await savePersona(persona);
              setShowCreatePersonaModal(false);
              // Switch to personas tab to show the newly created persona
              setActiveTab('personas');
              setSelectedItem(null);
              setDropdownPosition(null);
            } catch (error) {
              // Error is handled in modal
            }
          }}
        />
      )}

      {showEditPersonaModal && selectedPersona && (
        <EditPersonaModal
          persona={selectedPersona}
          onClose={() => {
            setShowEditPersonaModal(false);
            setSelectedPersona(null);
          }}
          onSave={async (persona) => {
            try {
              await savePersona({ ...persona, id: selectedPersona.id });
              setShowEditPersonaModal(false);
              setSelectedPersona(null);
              // Ensure we stay on personas tab
              setActiveTab('personas');
              setSelectedItem(null);
              setDropdownPosition(null);
            } catch (error) {
              // Error is handled in modal
            }
          }}
        />
      )}
    </div>
  );
}

// Create Template Modal
function CreateTemplateModal({
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-[#F7F7F7] p-6 dark:bg-[#222222]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Create Template</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Template Name *
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-[#111111] dark:text-gray-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-normal text-gray-900 transition-all hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500"
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
                className="w-full divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-lg dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
          </div>

          {formData.framework && !formData.customTemplate && (
            <div className="mt-5 space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {(frameworks as any)[formData.framework].name}
              </h3>
              {Object.entries((frameworks as any)[formData.framework].fields).map(
                ([key, label]) => (
                  <div key={key}>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                      className="w-full resize-none rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-[#111111] dark:text-gray-100"
                    />
                  </div>
                ),
              )}
            </div>
          )}

          {formData.customTemplate && (
            <div className="mt-5 space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Custom Template
              </h3>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  className="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? 'Creating...' : 'Save Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Template Modal
function EditTemplateModal({
  template,
  onClose,
  onSave,
}: {
  template: any;
  onClose: () => void;
  onSave: (template: any) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    name: template.name || '',
    framework: template.framework || '',
    customTemplate: template.is_custom || false,
    fields: template.content || ({} as Record<string, string>),
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
        fields: formData.fields.custom ? { custom: formData.fields.custom } : {},
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

    const updatedTemplate = {
      name: formData.name,
      framework: formData.customTemplate ? 'custom' : formData.framework,
      is_custom: formData.customTemplate,
      content: formData.fields,
    };

    setLoading(true);
    try {
      await onSave(updatedTemplate);
      onClose();
    } catch (error: any) {
      setError(error.message || 'Failed to update template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-[#F7F7F7] p-6 dark:bg-[#222222]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Edit Template</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Template Name *
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-[#111111] dark:text-gray-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Framework
            </label>
            <div className="relative">
              <DropdownPopup
                portal={false}
                sameWidth={true}
                anchor={{ x: 'start', y: 'bottom' }}
                menuId="framework-selector-edit"
                isOpen={isFrameworkMenuOpen}
                setIsOpen={setIsFrameworkMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    style={{ height: '40px' }}
                    className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-normal text-gray-900 transition-all hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500"
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
                className="w-full divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-lg dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
          </div>

          {formData.framework && !formData.customTemplate && (
            <div className="mt-5 space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {(frameworks as any)[formData.framework].name}
              </h3>
              {Object.entries((frameworks as any)[formData.framework].fields).map(
                ([key, label]) => (
                  <div key={key}>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                      className="w-full resize-none rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-[#111111] dark:text-gray-100"
                    />
                  </div>
                ),
              )}
            </div>
          )}

          {formData.customTemplate && (
            <div className="mt-5 space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Custom Template
              </h3>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  className="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? 'Updating...' : 'Update Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
function CreatePersonaModal({
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-[#F7F7F7] p-6 dark:bg-[#222222]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Create Agents</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-[#111111] dark:text-gray-100"
            />
          </div>

          {/* Predefined Personas - Above description */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-normal text-gray-900 transition-all hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500"
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
                className="w-full divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-lg dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
            {formData.selectedPredefinedId && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Agent template will be auto-filled below. Just edit the variables like{' '}
                {`{{variable_name}}`} with your values.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description {formData.selectedPredefinedId ? '' : '*'}
            </label>
            <TextareaAutosize
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              minRows={5}
              maxRows={10}
              required={!formData.selectedPredefinedId}
              aria-label="Persona description"
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-gray-800 dark:text-gray-100"
              placeholder={
                formData.selectedPredefinedId
                  ? 'Edit variables like {{focus_area}} with your values'
                  : 'Enter persona description...'
              }
            />
            {formData.selectedPredefinedId && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Variables to edit:{' '}
                {PREDEFINED_PERSONAS[parseInt(formData.selectedPredefinedId)]?.variables
                  .map((v) => `{{${v}}}`)
                  .join(', ')}
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
            >
              {loading ? 'Creating...' : 'Save Agents'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Persona Modal
function EditPersonaModal({
  persona,
  onClose,
  onSave,
}: {
  persona: any;
  onClose: () => void;
  onSave: (persona: any) => Promise<void>;
}) {
  // Initialize formData based on persona's current state
  const getInitialFormData = () => {
    return {
      name: persona.name || '',
      description: persona.description || '',
      usePredefined: false,
      selectedPredefinedId: '',
    };
  };

  const [formData, setFormData] = useState(getInitialFormData());
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
    const updatedPersona = {
      name: formData.name,
      description: formData.description || null,
      template_id: null,
      is_custom_template: false,
      content: {},
    };

    console.log('Updating persona with:', updatedPersona);

    setLoading(true);
    try {
      await onSave(updatedPersona);
      onClose();
    } catch (error: any) {
      setError(error.message || 'Failed to update agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-[#F7F7F7] p-6 dark:bg-[#222222]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Edit Agents</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 bg-[#FFFFFF] px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-[#111111] dark:text-gray-100"
            />
          </div>

          {/* Predefined Personas - Above description */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Predefined Persona (optional)
            </label>
            <div className="relative">
              <DropdownPopup
                portal={false}
                sameWidth={true}
                anchor={{ x: 'start', y: 'bottom' }}
                menuId="predefined-persona-selector-edit"
                isOpen={isPredefinedMenuOpen}
                setIsOpen={setIsPredefinedMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    style={{ height: '40px' }}
                    className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-normal text-gray-900 transition-all hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500"
                  >
                    <span>
                      {formData.selectedPredefinedId
                        ? PREDEFINED_PERSONAS[parseInt(formData.selectedPredefinedId)].name
                        : '-- Select Predefined Persona (Optional) --'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Ariakit.MenuButton>
                }
                items={[
                  {
                    label: '-- Select Predefined Persona (Optional) --',
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
                className="w-full divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-lg dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
            {formData.selectedPredefinedId && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Persona template will be auto-filled below. Just edit the variables like{' '}
                {`{{variable_name}}`} with your values.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description {formData.selectedPredefinedId ? '' : '*'}
            </label>
            <TextareaAutosize
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              minRows={5}
              maxRows={10}
              required={!formData.selectedPredefinedId}
              aria-label="Persona description"
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-400 dark:bg-gray-800 dark:text-gray-100"
              placeholder={
                formData.selectedPredefinedId
                  ? 'Edit variables like {{focus_area}} with your values'
                  : 'Enter persona description...'
              }
            />
            {formData.selectedPredefinedId && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Variables to edit:{' '}
                {PREDEFINED_PERSONAS[parseInt(formData.selectedPredefinedId)]?.variables
                  .map((v) => `{{${v}}}`)
                  .join(', ')}
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? 'Updating...' : 'Update Agent'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
