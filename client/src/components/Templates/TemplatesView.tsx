import * as Ariakit from '@ariakit/react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
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
import { ChevronDown, Edit, MoreVertical, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { saasApi } from '~/services/saasApi';
import { cn } from '~/utils';
import { asset } from '~/utils/assetPath';
import { isResearchSystemRow, researchOwnerColumnLabel } from '~/utils/researchOwner';

/** One-line summary for the templates table (role/task/format or flattened text). */
function getTemplateShortDescriptionLine(template: {
  detailedPrompt?: string;
  description?: string;
  framework?: string;
}): string {
  const templateContent = template.detailedPrompt || template.description || '';
  if (!templateContent) {
    return template.framework || 'No template content';
  }
  const lines = templateContent.split('\n').filter((line) => line.trim());
  if (lines.length === 0) {
    return templateContent.replace(/\s+/g, ' ').trim();
  }
  let role = '';
  let task = '';
  let format = '';
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('role') || lowerLine.includes('act as')) {
      role = line.replace(/.*(?:role|act as)[:\s]*/i, '').trim();
    } else if (lowerLine.includes('task') || lowerLine.includes('create')) {
      task = line.replace(/.*(?:task|create)[:\s]*/i, '').trim();
    } else if (lowerLine.includes('format') || lowerLine.includes('show as')) {
      format = line.replace(/.*(?:format|show as)[:\s]*/i, '').trim();
    }
  }
  if (role || task || format) {
    return [role && `Role: ${role}`, task && `Task: ${task}`, format && `Format: ${format}`]
      .filter(Boolean)
      .join(' · ');
  }
  return templateContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

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

  /** Conflux often returns camelCase `createdAt`; UI historically used `created_at`. */
  const pickCreatedAt = (row: Record<string, unknown>): string => {
    const raw =
      row.created_at ??
      row.createdAt ??
      row.date_created ??
      row.dateCreated ??
      '';
    return raw === null || raw === undefined ? '' : String(raw);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Unknown';
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
    <div className="flex h-screen flex-col bg-fig-Surface-standard px-2 pb-2 pt-0">
      {/* Tabs */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-[var(--Gap-group)] sm:gap-[var(--Gap-group)]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('personas');
                setSelectedItem(null);
                setDropdownPosition(null);
              }}
              className={cn(
                'font-inter inline-flex items-center border-b-2 px-0 text-sm font-normal leading-5 transition-colors',
                activeTab === 'personas'
                  ? 'border-fig-Stroke-primary py-[var(--Padding-spacer)] text-fig-Subject-standard'
                  : 'border-transparent py-[var(--Padding-spacer)] text-fig-Subject-neutral',
              )}
            >
              Agents
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('templates');
                setSelectedItem(null);
                setDropdownPosition(null);
              }}
              className={cn(
                'font-inter inline-flex items-center border-b-2 px-0 text-sm font-normal leading-5 transition-colors',
                activeTab === 'templates'
                  ? 'border-fig-Stroke-primary py-[var(--Padding-spacer)] text-fig-Subject-standard'
                  : 'border-transparent py-[var(--Padding-spacer)] text-fig-Subject-neutral',
              )}
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
            className={cn(
              'h-[var(--Size-zero-button)] rounded-[2px] border border-fig-Stroke-primary bg-fig-Surface-two-primary',
              'fy-typography-label-small px-4 !text-fig-Subject-two-primary',
              'transition-opacity hover:opacity-90',
              'hover:!border-fig-Stroke-primary hover:!bg-fig-Surface-two-primary hover:!text-fig-Subject-two-primary',
            )}
          >
            + Create {activeTab === 'templates' ? 'template' : 'agent'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto py-[var(--Gap-parentChild)]">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="font-inter text-sm text-fig-Subject-neutral">Loading...</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center">
            <p className="font-inter mb-4 text-sm text-fig-Subject-neutral">
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
              className={cn(
                'h-[var(--Size-zero-button)] rounded-[2px] border border-fig-Stroke-primary bg-fig-Surface-two-primary',
                'fy-typography-label-small px-4 !text-fig-Subject-two-primary',
                'transition-opacity hover:opacity-90',
                'hover:!border-fig-Stroke-primary hover:!bg-fig-Surface-two-primary hover:!text-fig-Subject-two-primary',
              )}
            >
              + Create {activeTab === 'templates' ? 'template' : 'agent'}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[2px] border border-fig-Stroke-soft">
            <table className="w-full min-w-[800px] table-fixed border-separate border-spacing-0">
              <thead className="bg-fig-Surface-one-neutral">
                <tr>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                      'w-[var(--Grids-three)] min-w-0',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Short description
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-left align-middle',
                      'hidden md:table-cell',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Owner
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-right align-middle',
                      'w-[var(--Grids-two)] min-w-0 whitespace-nowrap',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Date created
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'box-border h-[var(--Size-tableHeader)] p-[var(--Padding-spacer)] text-right align-middle',
                      'w-[var(--Grids-one)] min-w-0',
                      'font-inter text-xs font-medium leading-[14px] text-fig-Subject-standard',
                    )}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fig-Stroke-soft">
                {activeTab === 'templates'
                  ? templates.map((template, rowIndex) => {
                      const templateKey = String(
                        template?.id ??
                          template?.templateId ??
                          template?.template_id ??
                          `row-${rowIndex}`,
                      );
                      const isSelected =
                        selectedItem?.type === 'template' && selectedItem.id === template.id;
                      const shortDescriptionLine = getTemplateShortDescriptionLine(template);
                      const templateRow = template as Record<string, unknown>;
                      const isSystemTemplate = isResearchSystemRow(templateRow);
                      return (
                        <tr
                          key={templateKey}
                          className={cn(
                            'group cursor-pointer',
                            'hover:bg-fig-Surface-neutral',
                            rowIndex % 2 === 0
                              ? 'bg-fig-Surface-standard'
                              : 'bg-fig-Surface-zero-neutral',
                          )}
                        >
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                              'border-r border-fig-Stroke-soft',
                              'overflow-hidden',
                            )}
                          >
                            <div className="flex h-full min-h-0 items-center gap-2 sm:gap-[var(--Gap-neighbor)]">
                              <div
                                className={cn(
                                  'box-border flex h-[var(--Size-zero-button)] w-[var(--Size-zero-button)] shrink-0 items-center justify-center rounded-none p-1',
                                  rowIndex % 2 === 0
                                    ? 'bg-fig-Surface-neutral'
                                    : 'bg-fig-Surface-one-neutral',
                                )}
                              >
                                <img
                                  src={asset('documents.svg')}
                                  alt="Template"
                                  className="block h-5 w-5 flex-shrink-0 object-contain opacity-70 dark:opacity-70 dark:brightness-0 dark:invert"
                                />
                              </div>
                              <div className="fy-typography-title-small truncate text-fig-Subject-standard [font-weight:var(--Dimensions-Weight-m)]">
                                {template.name}
                              </div>
                            </div>
                          </td>
                          <td
                            className={cn(
                              'p-[var(--Padding-spacer)] align-middle',
                              'w-0 min-w-0 max-w-[11rem] sm:max-w-[14rem]',
                            )}
                          >
                            <div
                              className="font-inter text-sm font-normal leading-5 text-fig-Subject-standard"
                              title={shortDescriptionLine}
                            >
                              {shortDescriptionLine}
                            </div>
                          </td>
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)]',
                              'hidden p-[var(--Padding-spacer)] text-left align-middle md:table-cell',
                              'font-inter text-sm font-normal leading-5 text-fig-Subject-standard',
                            )}
                          >
                            {researchOwnerColumnLabel(templateRow)}
                          </td>
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)]',
                              'min-w-0 whitespace-nowrap text-right',
                              'font-inter text-sm font-normal leading-5 text-fig-Subject-standard',
                            )}
                          >
                            {formatDate(pickCreatedAt(templateRow))}
                          </td>
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] text-right align-middle',
                              'font-inter text-sm font-medium leading-5',
                            )}
                          >
                            {!isSystemTemplate ? (
                              <div className="relative flex h-full min-h-0 items-center justify-end gap-2 text-left">
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
                                  className="dropdown-trigger rounded-[2px] p-1 text-fig-Subject-standard transition-colors hover:bg-fig-Surface-one-standard"
                                  title="More options"
                                >
                                  <MoreVertical className="h-3 w-3" aria-hidden />
                                </button>
                                {isSelected &&
                                  dropdownPosition &&
                                  createPortal(
                                    <div
                                      className="fixed z-[9999] w-48 rounded-[2px] border border-fig-Stroke-soft bg-fig-Surface-standard shadow-lg"
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
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-fig-Subject-standard hover:bg-fig-Surface-one-standard"
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
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-destructive hover:bg-fig-Surface-one-standard"
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
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  : personas.map((persona, rowIndex) => {
                      const personaKey = String(
                        persona?.id ??
                          persona?.personaId ??
                          persona?.persona_id ??
                          `row-${rowIndex}`,
                      );
                      const personaRow = persona as Record<string, unknown>;
                      const isSystemPersona = isResearchSystemRow(personaRow);
                      const isSelected =
                        selectedItem?.type === 'persona' && selectedItem.id === persona.id;
                      return (
                        <tr
                          key={personaKey}
                          className={cn(
                            'group cursor-pointer',
                            'hover:bg-fig-Surface-neutral',
                            rowIndex % 2 === 0
                              ? 'bg-fig-Surface-standard'
                              : 'bg-fig-Surface-zero-neutral',
                          )}
                        >
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] align-middle',
                              'border-r border-fig-Stroke-soft',
                              'overflow-hidden',
                            )}
                          >
                            <div className="flex h-full min-h-0 items-center gap-2 sm:gap-[var(--Gap-neighbor)]">
                              <div
                                className={cn(
                                  'box-border flex h-[var(--Size-zero-button)] w-[var(--Size-zero-button)] shrink-0 items-center justify-center rounded-none p-1',
                                  rowIndex % 2 === 0
                                    ? 'bg-fig-Surface-neutral'
                                    : 'bg-fig-Surface-one-neutral',
                                )}
                              >
                                <img
                                  src={asset('Leads.svg')}
                                  alt="Persona"
                                  className="block h-5 w-5 flex-shrink-0 object-contain opacity-80 dark:invert"
                                />
                              </div>
                              <div className="font-inter min-w-0 truncate text-sm font-medium leading-4 text-fig-Subject-standard">
                                {persona.name}
                              </div>
                            </div>
                          </td>
                          <td
                            className={cn(
                              'p-[var(--Padding-spacer)] align-middle',
                              'w-0 min-w-0 max-w-[11rem] sm:max-w-[14rem]',
                            )}
                          >
                            <p
                              className="font-inter m-0 min-w-0 truncate text-sm font-normal leading-5 text-fig-Subject-neutral"
                              title={persona.description || 'No description'}
                            >
                              {persona.description || 'No description'}
                            </p>
                          </td>
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)]',
                              'hidden p-[var(--Padding-spacer)] text-left align-middle md:table-cell',
                              'font-inter text-sm font-normal leading-5 text-fig-Subject-standard',
                            )}
                          >
                            {researchOwnerColumnLabel(personaRow)}
                          </td>
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)]',
                              'min-w-0 whitespace-nowrap text-right',
                              'font-inter text-sm font-normal leading-5 text-fig-Subject-standard',
                            )}
                          >
                            {formatDate(pickCreatedAt(personaRow))}
                          </td>
                          <td
                            className={cn(
                              'box-border h-[var(--Size-tableBody)] max-h-[var(--Size-tableBody)] p-[var(--Padding-spacer)] text-right align-middle',
                              'font-inter text-sm font-medium leading-5',
                            )}
                          >
                            {!isSystemPersona ? (
                              <div className="relative flex h-full min-h-0 items-center justify-end gap-2 text-left">
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
                                  className="dropdown-trigger rounded-[2px] p-1 text-fig-Subject-standard transition-colors hover:bg-fig-Surface-one-standard"
                                  title="More options"
                                >
                                  <MoreVertical className="h-3 w-3" aria-hidden />
                                </button>
                                {isSelected &&
                                  dropdownPosition &&
                                  createPortal(
                                    <div
                                      className="fixed z-[9999] w-48 rounded-[2px] border border-fig-Stroke-soft bg-fig-Surface-standard shadow-lg"
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
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-fig-Subject-standard hover:bg-fig-Surface-one-standard"
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
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-destructive hover:bg-fig-Surface-one-standard"
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
                            ) : null}
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

  const frameworkLabel = (() => {
    if (formData.customTemplate) {
      return 'Custom template';
    }
    if (formData.framework) {
      return (frameworks as any)[formData.framework].name as string;
    }
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                  }
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
              {'Create template'}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'inline-flex h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] items-center justify-center',
                'rounded-[var(--Corner-moderatelyRounded)] text-fig-Subject-standard transition-colors',
                'hover:bg-fig-Surface-neutral',
                'focus:outline-none focus-visible:ring-fig-Stroke-primary',
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

              {/* Description / framework fields */}
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
    <DialogPrimitive.Root open={true} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[999] bg-transparent" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[999] flex w-full max-w-[var(--Size-overlay)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden p-0',
            'gap-0',
            'border border-fig-Stroke-soft bg-fig-Surface-one-standard',
            'rounded-[var(--Corner-highlyRounded)]',
            'text-fig-Subject-standard shadow-none',
            'animate-in data-[state=open]:fade-in-90',
          )}
        >
          {/* Header */}
          <div
            className={cn(
              'mb-0 flex shrink-0 flex-col space-y-0 border-0',
              'px-[var(--Gap-parentChild)] pt-[var(--Padding-sibling)]',
            )}
          >
            <div className="flex items-center justify-between gap-[var(--Gap-parentChild)]">
              <DialogPrimitive.Title className="fy-typography-title m-0 text-fig-Subject-standard">
                {'Edit template'}
              </DialogPrimitive.Title>
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
          </div>

          {/* Body */}
          <div className="flex flex-col gap-[var(--Gap-parentChild)] px-[var(--Gap-parentChild)] py-[var(--Gap-parentChild)]">
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
                {/* Template name field */}
                <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                  <label className="fy-typography-label-small text-fig-Subject-neutral">
                    {'Template name'}
                  </label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Example: Research template"
                    className={cn(
                      'fy-typography-body-small h-[var(--Size-input)] w-full',
                      'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                      '!bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] !text-fig-Subject-standard',
                      'placeholder:!text-fig-Subject-soft',
                      'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
                      'transition-colors duration-200',
                    )}
                  />
                </div>

                {/* Framework dropdown */}
                <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                  <label className="fy-typography-label-small text-fig-Subject-neutral">
                    {'Select framework'}
                  </label>
                  <DropdownPopup
                    portal={false}
                    sameWidth={true}
                    anchor={{ x: 'start', y: 'bottom' }}
                    menuId="framework-selector-edit"
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
                          {formData.customTemplate
                            ? 'Create Custom Template'
                            : formData.framework
                              ? (frameworks as any)[formData.framework].name
                              : '-- Select Framework --'}
                        </span>
                        <ChevronDown
                          className="h-[var(--Size-icon)] w-[var(--Size-icon)] shrink-0 text-fig-Subject-soft"
                          aria-hidden
                        />
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

                {/* Framework-specific fields */}
                {formData.framework && !formData.customTemplate && (
                  <div className="flex flex-col gap-[var(--Gap-zero-spacer)]">
                    <p className="fy-typography-label-small text-fig-Subject-neutral">
                      {(frameworks as any)[formData.framework].name}
                    </p>
                    {Object.entries((frameworks as any)[formData.framework].fields).map(
                      ([key, label]) => (
                        <div key={key} className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                          <label className="fy-typography-label-small text-fig-Subject-neutral">
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
                      ),
                    )}
                  </div>
                )}

                {/* Custom template field */}
                {formData.customTemplate && (
                  <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                    <label className="fy-typography-label-small text-fig-Subject-neutral">
                      {'Template content'}
                    </label>
                    <TextareaAutosize
                      value={formData.fields.custom || ''}
                      onChange={(e) => handleFieldChange('custom', e.target.value)}
                      minRows={8}
                      maxRows={15}
                      placeholder="Enter your custom template here..."
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
                )}
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
                  {loading ? 'Updating...' : 'Update template'}
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
            'px-[var(--Gap-parentChild)] pt-[var(--Padding-zero-parentChild)]',
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
                'inline-flex h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] items-center justify-center',
                'rounded-[var(--Corner-moderatelyRounded)] text-fig-Subject-standard transition-colors',
                'hover:bg-fig-Surface-neutral',
                'focus:outline-none focus-visible:ring-fig-Stroke-primary',
              )}
              aria-label="Close"
            >
              <X className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)]" aria-hidden />
            </button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-col gap-[var(--Gap-parentChild)] px-[var(--Gap-parentChild)] py-[var(--Gap-parentChild)]">
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
              <div className="flex flex-col gap-[var(--Gap-parentChild)]">
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
              <div className="flex flex-col gap-[var(--Gap-parentChild)]">
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
                        'fy-typography-body flex h-[var(--Size-input)] w-full items-center justify-between',
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
              <div className="flex flex-col gap-[var(--Gap-parentChild)]">
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
              {'Edit agent'}
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
                  {'Name of the agent'}
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Example: Research assistant"
                  className={cn(
                    'fy-typography-body-small h-[var(--Size-input)] w-full',
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
                  {'Select pre-defined agent (Optional)'}
                </label>
                <DropdownPopup
                  portal={false}
                  sameWidth={true}
                  anchor={{ x: 'start', y: 'bottom' }}
                  menuId="predefined-persona-selector-edit"
                  isOpen={isPredefinedMenuOpen}
                  setIsOpen={setIsPredefinedMenuOpen}
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
                    ...PREDEFINED_PERSONAS.map((p, idx) => ({
                      label: p.name,
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
                  {'Description'}
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
                  'fy-typography-label h-[var(--Size-button)] rounded-[2px]',
                  'border border-fig-Stroke-primary bg-fig-Surface-two-primary !text-fig-Subject-two-primary',
                  'transition-opacity hover:opacity-90',
                  'hover:!border-fig-Stroke-primary hover:!bg-fig-Surface-two-primary hover:!text-fig-Subject-two-primary',
                  'disabled:opacity-50',
                )}
              >
                {loading ? 'Updating...' : 'Update agent'}
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
