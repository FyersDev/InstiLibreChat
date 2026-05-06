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
import { ChevronDown, Edit, Eye, MoreVertical, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import CreatePersonaModal from '~/components/Templates/CreatePersonaModal';
import CreateTemplateModal from '~/components/Templates/CreateTemplateModal';
import { usePredefinedResearchCatalog } from '~/hooks/usePredefinedResearchCatalog';
import { saasApi } from '~/services/saasApi';
import { cn } from '~/utils';
import { asset } from '~/utils/assetPath';
import {
  isResearchSystemRow,
  researchOwnerColumnLabel,
  researchPersonaId,
  researchTemplateId,
} from '~/utils/researchOwner';

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
  /** System templates / personas open Edit modal in read-only (View) mode. */
  const [templateModalReadOnly, setTemplateModalReadOnly] = useState(false);
  const [personaModalReadOnly, setPersonaModalReadOnly] = useState(false);
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
    const tid =
      researchTemplateId(template as object) ??
      (template?.id != null ? String(template.id) : undefined);
    try {
      if (tid) {
        await saasApi.updateTemplate(tid, template);
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
          (tid ? 'Failed to update Template' : 'Failed to create Template'),
        status: 'error',
      });
      throw error;
    }
  };

  const savePersona = async (persona: any) => {
    const pid =
      researchPersonaId(persona as object) ??
      (persona?.id != null ? String(persona.id) : undefined);
    try {
      if (pid) {
        await saasApi.updatePersona(pid, persona);
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
          error.message || (pid ? 'Failed to update Agent' : 'Failed to create Agent'),
        status: 'error',
      });
      throw error;
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      // Find the template being deleted to check if it's currently selected
      const templateToDelete = templates.find(
        (t) => researchTemplateId(t as object) === id,
      );

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
      const personaToDelete = personas.find((p) => researchPersonaId(p as object) === id);

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
    setTemplateModalReadOnly(false);
    setShowEditTemplateModal(true);
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const handleViewTemplate = (template: any) => {
    setSelectedTemplate(template);
    setTemplateModalReadOnly(true);
    setShowEditTemplateModal(true);
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const handleEditPersona = (persona: any) => {
    setSelectedPersona(persona);
    setPersonaModalReadOnly(false);
    setShowEditPersonaModal(true);
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const handleViewPersona = (persona: any) => {
    setSelectedPersona(persona);
    setPersonaModalReadOnly(true);
    setShowEditPersonaModal(true);
    setSelectedItem(null);
    setDropdownPosition(null);
  };

  const handleDeleteTemplate = async (template: any) => {
    if (window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      setDeleting(true);
      try {
        const tid = researchTemplateId(template as object);
        if (!tid) {
          throw new Error('Missing template id');
        }
        await deleteTemplate(tid);
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
        const pid = researchPersonaId(persona as object);
        if (!pid) {
          throw new Error('Missing agent id');
        }
        await deletePersona(pid);
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
                      const tid = researchTemplateId(template as object);
                      const templateKey = String(tid ?? `row-${rowIndex}`);
                      const isSelected =
                        selectedItem?.type === 'template' && selectedItem.id === templateKey;
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
                            <div className="relative flex h-full min-h-0 items-center justify-end gap-2 text-left">
                              <button
                                ref={(el) => {
                                  if (el) {
                                    buttonRefs.current.set(`template-${templateKey}`, el);
                                  } else {
                                    buttonRefs.current.delete(`template-${templateKey}`);
                                  }
                                }}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const isCurrentlySelected =
                                    selectedItem?.type === 'template' &&
                                    selectedItem.id === templateKey;
                                  if (isCurrentlySelected) {
                                    setSelectedItem(null);
                                    setDropdownPosition(null);
                                  } else {
                                    const button = buttonRefs.current.get(`template-${templateKey}`);
                                    if (button) {
                                      const rect = button.getBoundingClientRect();
                                      setDropdownPosition({
                                        top: rect.bottom + 4,
                                        right: window.innerWidth - rect.right,
                                      });
                                    }
                                    setSelectedItem({ type: 'template', id: templateKey });
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
                                      {isSystemTemplate ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleViewTemplate(template);
                                          }}
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-fig-Subject-standard hover:bg-fig-Surface-one-standard"
                                        >
                                          <Eye className="h-4 w-4" aria-hidden />
                                          View
                                        </button>
                                      ) : (
                                        <>
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
                                        </>
                                      )}
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
                      const pid = researchPersonaId(persona as object);
                      const personaKey = String(pid ?? `row-${rowIndex}`);
                      const personaRow = persona as Record<string, unknown>;
                      const isSystemPersona = isResearchSystemRow(personaRow);
                      const isSelected =
                        selectedItem?.type === 'persona' && selectedItem.id === personaKey;
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
                            <div className="relative flex h-full min-h-0 items-center justify-end gap-2 text-left">
                              <button
                                ref={(el) => {
                                  if (el) {
                                    buttonRefs.current.set(`persona-${personaKey}`, el);
                                  } else {
                                    buttonRefs.current.delete(`persona-${personaKey}`);
                                  }
                                }}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const isCurrentlySelected =
                                    selectedItem?.type === 'persona' &&
                                    selectedItem.id === personaKey;
                                  if (isCurrentlySelected) {
                                    setSelectedItem(null);
                                    setDropdownPosition(null);
                                  } else {
                                    const button = buttonRefs.current.get(`persona-${personaKey}`);
                                    if (button) {
                                      const rect = button.getBoundingClientRect();
                                      setDropdownPosition({
                                        top: rect.bottom + 4,
                                        right: window.innerWidth - rect.right,
                                      });
                                    }
                                    setSelectedItem({ type: 'persona', id: personaKey });
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
                                      {isSystemPersona ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleViewPersona(persona);
                                          }}
                                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-normal leading-5 text-fig-Subject-standard hover:bg-fig-Surface-one-standard"
                                        >
                                          <Eye className="h-4 w-4" aria-hidden />
                                          View
                                        </button>
                                      ) : (
                                        <>
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
                                        </>
                                      )}
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
          readOnly={templateModalReadOnly}
          onClose={() => {
            setShowEditTemplateModal(false);
            setSelectedTemplate(null);
            setTemplateModalReadOnly(false);
            setSelectedItem(null);
            setDropdownPosition(null);
          }}
          onSave={async (template) => {
            try {
              const tid = researchTemplateId(selectedTemplate as object);
              await saveTemplate({ ...template, ...(tid ? { id: tid } : {}) });
              setShowEditTemplateModal(false);
              setSelectedTemplate(null);
              setTemplateModalReadOnly(false);
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
          readOnly={personaModalReadOnly}
          onClose={() => {
            setShowEditPersonaModal(false);
            setSelectedPersona(null);
            setPersonaModalReadOnly(false);
            setSelectedItem(null);
            setDropdownPosition(null);
          }}
          onSave={async (persona) => {
            try {
              const pid = researchPersonaId(selectedPersona as object);
              await savePersona({ ...persona, ...(pid ? { id: pid } : {}) });
              setShowEditPersonaModal(false);
              setSelectedPersona(null);
              setPersonaModalReadOnly(false);
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


type TemplateFrameworkMap = Record<
  string,
  { name: string; fields: Record<string, string> }
>;

/** API may send `framework: "custom"`, unknown keys, string `content`, or omit `is_custom`. */
function coerceTemplateContentFields(content: unknown): Record<string, string> {
  if (content == null) {
    return {};
  }
  if (typeof content === 'string') {
    return { custom: content };
  }
  if (typeof content === 'object' && !Array.isArray(content)) {
    return content as Record<string, string>;
  }
  return {};
}

function initialEditTemplateFormState(template: any, frameworks: TemplateFrameworkMap) {
  const fields = coerceTemplateContentFields(template?.content);
  const rawFw = template?.framework != null ? String(template.framework).trim() : '';
  const treatAsCustom =
    template?.is_custom === true ||
    template?.is_custom === 1 ||
    rawFw.toLowerCase() === 'custom';

  if (treatAsCustom) {
    return {
      name: template?.name || '',
      framework: '',
      customTemplate: true,
      fields,
    };
  }

  let fwKey = rawFw;
  if (fwKey && !frameworks[fwKey]) {
    const found = Object.keys(frameworks).find((k) => k.toLowerCase() === fwKey.toLowerCase());
    if (found) {
      fwKey = found;
    }
  }

  if (fwKey && frameworks[fwKey]) {
    return {
      name: template?.name || '',
      framework: fwKey,
      customTemplate: false,
      fields,
    };
  }

  return {
    name: template?.name || '',
    framework: '',
    customTemplate: true,
    fields,
  };
}

// Edit Template Modal
function EditTemplateModal({
  template,
  onClose,
  onSave,
  readOnly = false,
}: {
  template: any;
  onClose: () => void;
  onSave: (template: any) => Promise<void>;
  readOnly?: boolean;
}) {
  const {
    frameworksByCode,
    frameworkList,
    loading: catalogLoading,
    error: catalogError,
  } = usePredefinedResearchCatalog();

  const templateStableKey =
    researchTemplateId(template as object) ??
    `${String(template?.name ?? '')}:${String(template?.framework ?? '')}`;

  const [formData, setFormData] = useState<ReturnType<
    typeof initialEditTemplateFormState
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFrameworkMenuOpen, setIsFrameworkMenuOpen] = useState(false);

  useEffect(() => {
    if (catalogLoading) {
      return;
    }
    setFormData(initialEditTemplateFormState(template, frameworksByCode));
  }, [catalogLoading, templateStableKey, frameworksByCode]);

  const handleFrameworkChange = (framework: string) => {
    if (readOnly) {
      return;
    }
    if (framework === 'custom') {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              framework: '',
              customTemplate: true,
              fields: prev.fields.custom ? { custom: prev.fields.custom } : {},
            }
          : prev,
      );
    } else if (!framework) {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              framework: '',
              customTemplate: false,
              fields: {},
            }
          : prev,
      );
    } else {
      const def = frameworksByCode[framework];
      if (!def) {
        return;
      }
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              framework,
              customTemplate: false,
              fields: def.fields,
            }
          : prev,
      );
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    if (readOnly) {
      return;
    }
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            fields: {
              ...prev.fields,
              [key]: value,
            },
          }
        : prev,
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      return;
    }
    const fd = formData;
    if (!fd) {
      return;
    }
    setError(null);
    if (!fd.name.trim()) {
      setError('Template name is required');
      return;
    }

    if (fd.customTemplate) {
      if (!fd.fields.custom || !fd.fields.custom.trim()) {
        setError('Custom template content is required');
        return;
      }
    } else {
      const frameworkFields = frameworksByCode[fd.framework]?.fields || {};
      const allFilled = Object.keys(frameworkFields).every((key) => {
        const value = fd.fields[key];
        return value && value.trim() !== '';
      });
      if (!allFilled) {
        setError('Please fill in all framework fields');
        return;
      }
    }

    const updatedTemplate = {
      name: fd.name,
      framework: fd.customTemplate ? 'custom' : fd.framework,
      is_custom: fd.customTemplate,
      content: fd.fields,
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

  if (catalogLoading || !formData) {
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
              'px-[var(--Gap-parentChild)] py-[var(--Padding-sibling)]',
              'text-fig-Subject-standard shadow-none',
              'animate-in data-[state=open]:fade-in-90',
            )}
          >
            <p className="fy-typography-body-small text-fig-Subject-neutral">Loading frameworks…</p>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

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
                {readOnly ? 'View template' : 'Edit template'}
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
                {/* Template name field */}
                <div className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                  <label className="fy-typography-label-small text-fig-Subject-neutral">
                    {'Template name'}
                  </label>
                  <Input
                    type="text"
                    value={formData.name}
                    readOnly={readOnly}
                    onChange={(e) =>
                      setFormData((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                    }
                    required
                    placeholder="Example: Research template"
                    className={cn(
                      'fy-typography-body-small h-[var(--Size-input)] w-full',
                      'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft',
                      '!bg-fig-Surface-standard px-[var(--Padding-zero-spacer)] !text-fig-Subject-standard',
                      'placeholder:!text-fig-Subject-soft',
                      'focus:border-fig-Stroke-primary focus:outline-none focus:ring-1 focus:ring-fig-Stroke-primary',
                      'transition-colors duration-200',
                      readOnly && 'cursor-default opacity-90',
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
                    isOpen={readOnly ? false : isFrameworkMenuOpen}
                    setIsOpen={(open) => {
                      if (!readOnly) {
                        setIsFrameworkMenuOpen(open);
                      }
                    }}
                    trigger={
                      <Ariakit.MenuButton
                        disabled={readOnly}
                        className={cn(
                          'fy-typography-body flex h-[var(--Size-input)] w-full items-center justify-between',
                          'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                          'px-[var(--Padding-zero-spacer)] text-fig-Subject-standard',
                          'transition-colors hover:border-fig-Stroke-standard',
                          readOnly && 'cursor-default opacity-90',
                        )}
                      >
                        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis text-left">
                          {formData.customTemplate
                            ? 'Create Custom Template'
                            : formData.framework && frameworksByCode[formData.framework]
                              ? frameworksByCode[formData.framework].name
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
                      ...frameworkList.map((fw) => ({
                        label: fw.name,
                        onClick: () => {
                          handleFrameworkChange(fw.code);
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
                {formData.framework &&
                  !formData.customTemplate &&
                  frameworksByCode[formData.framework] && (
                  <div className="flex flex-col gap-[var(--Gap-zero-spacer)]">
                    <p className="fy-typography-label-small text-fig-Subject-neutral">
                      {frameworksByCode[formData.framework].name}
                    </p>
                    {Object.entries(frameworksByCode[formData.framework].fields).map(
                      ([key, label]) => (
                        <div key={key} className="flex flex-col gap-[var(--Gap-zero-parentChild)]">
                          <label className="fy-typography-label-small text-fig-Subject-neutral">
                            {String(label)}
                          </label>
                          <TextareaAutosize
                            value={formData.fields[key] || ''}
                            readOnly={readOnly}
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
                              readOnly && 'cursor-default opacity-90',
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
                      readOnly={readOnly}
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
                        readOnly && 'cursor-default opacity-90',
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-[var(--Gap-zero-neighbor)]">
                {!readOnly && (
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
                )}
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


// Edit Persona Modal
function EditPersonaModal({
  persona,
  onClose,
  onSave,
  readOnly = false,
}: {
  persona: any;
  onClose: () => void;
  onSave: (persona: any) => Promise<void>;
  readOnly?: boolean;
}) {
  const { agents: predefinedAgents, loading: catalogLoading, error: catalogError } =
    usePredefinedResearchCatalog();

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

  const selectedAgent = predefinedAgents.find((a) => a.agentId === formData.selectedPredefinedId);

  const handlePredefinedSelect = (agentId: string) => {
    if (readOnly) {
      return;
    }
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
    if (readOnly) {
      return;
    }
    if (!formData.name.trim()) {
      setError('Persona name is required');
      return;
    }
    // Description is optional when using predefined persona (auto-filled)
    if (!formData.selectedPredefinedId && !formData.description.trim()) {
      setError('Description is required');
      return;
    }
    const p = persona as Record<string, unknown>;
    const updatedPersona = {
      name: formData.name,
      description: formData.description || null,
      template_id: (p.template_id ?? p.templateId ?? null) as string | null,
      is_custom_template:
        typeof p.is_custom_template === 'boolean'
          ? p.is_custom_template
          : typeof p.isCustomTemplate === 'boolean'
            ? p.isCustomTemplate
            : true,
      content:
        p.content != null && typeof p.content === 'object' && !Array.isArray(p.content)
          ? (p.content as Record<string, unknown>)
          : {},
    };

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
              {readOnly ? 'View agent' : 'Edit agent'}
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
                  {'Name of the agent'}
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  readOnly={readOnly}
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
                    readOnly && 'cursor-default opacity-90',
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
                  isOpen={readOnly ? false : isPredefinedMenuOpen}
                  setIsOpen={(open) => {
                    if (!readOnly) {
                      setIsPredefinedMenuOpen(open);
                    }
                  }}
                  trigger={
                    <Ariakit.MenuButton
                      disabled={readOnly}
                      className={cn(
                        'fy-typography-body flex h-[var(--Size-input)] w-full items-center justify-between',
                        'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                        'px-[var(--Padding-zero-spacer)] text-fig-Subject-standard',
                        'transition-colors hover:border-fig-Stroke-standard',
                        readOnly && 'cursor-default opacity-90',
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
                  {'Description'}
                </label>
                <TextareaAutosize
                  value={formData.description}
                  readOnly={readOnly}
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
                    readOnly && 'cursor-default opacity-90',
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
              {!readOnly && (
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
              )}
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
