import * as Ariakit from '@ariakit/react';
import { useToastContext } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import { ChevronDown, ChevronRight, Search, User } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import CreatePersonaModal from '~/components/Templates/CreatePersonaModal';
import { saasApi } from '~/services/saasApi';
import { cn } from '~/utils';

const DEFAULT_PERSONA = 'FIA (Default)';

interface SavedPersona {
  name: string;
  description: string;
  detailedPrompt: string;
}

export default function PersonaSelector() {
  const [personas, setPersonas] = useState<SavedPersona[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string>(DEFAULT_PERSONA);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchQueryRef = useRef('');
  const { conversationId } = useParams<{ conversationId?: string }>();
  const hasInitialized = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToastContext();
  const menu = Ariakit.useMenuStore({
    open: isOpen,
    setOpen: (open) => {
      if (!open) {
        searchQueryRef.current = '';
        setSearchQuery('');
      }
      setIsOpen(open);
    },
  });

  const fetchPersonas = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[PersonaSelector] Fetching personas from backend...');
      const response = await saasApi.getPersonas();
      console.log('[PersonaSelector] Raw API response:', response);

      let personasArray: any[] = [];
      if (response) {
        if (Array.isArray(response)) {
          personasArray = response;
        } else {
          const responseAny = response as any;
          if (responseAny.data && Array.isArray(responseAny.data)) {
            personasArray = responseAny.data;
          }
        }
      }

      if (personasArray.length > 0) {
        const parsedPersonas: SavedPersona[] = personasArray.map((item: any) => {
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
            name: item.name || item.persona || 'Unnamed Persona',
            description: item.description || '',
            detailedPrompt: detailedPrompt || item.name || '',
          };
        });

        console.log('[PersonaSelector] Parsed personas:', parsedPersonas);
        setPersonas(parsedPersonas);
      } else {
        console.warn('[PersonaSelector] No personas found in response:', response);
        setPersonas([]);
      }
    } catch (error) {
      console.error('[PersonaSelector] Error fetching personas:', error);
      setPersonas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    fetchPersonas();
  }, [fetchPersonas]);

  useEffect(() => {
    const handlePersonasListUpdate = () => {
      console.log('[PersonaSelector] Personas list updated, refetching...');
      fetchPersonas();
    };
    window.addEventListener('personasListUpdated', handlePersonasListUpdate);
    return () => {
      window.removeEventListener('personasListUpdated', handlePersonasListUpdate);
    };
  }, [fetchPersonas]);

  useEffect(() => {
    if (personas.length === 0 || loading) return;

    const convoId = conversationId || Constants.NEW_CONVO;
    const personaData = localStorage.getItem(`persona_data_${convoId}`);

    if (!personaData) {
      const fiaDefaultPersona = personas.find((p) => p.name === DEFAULT_PERSONA);

      if (fiaDefaultPersona) {
        const defaultPersonaData = {
          persona: fiaDefaultPersona.name,
          name: fiaDefaultPersona.name,
          description: fiaDefaultPersona.description || '',
          detailedPrompt:
            fiaDefaultPersona.detailedPrompt ||
            fiaDefaultPersona.description ||
            fiaDefaultPersona.name,
          content: {
            custom:
              fiaDefaultPersona.detailedPrompt ||
              fiaDefaultPersona.description ||
              fiaDefaultPersona.name,
          },
        };

        localStorage.setItem(`persona_data_${convoId}`, JSON.stringify(defaultPersonaData));
        console.log(
          'FIA (Default) persona automatically set for conversation:',
          convoId,
          defaultPersonaData,
        );
        window.dispatchEvent(new Event('personaUpdated'));
      } else {
        console.warn('[PersonaSelector] FIA (Default) persona not found in fetched personas');
      }
    }
  }, [personas, conversationId, loading]);

  useEffect(() => {
    const convoId = conversationId || Constants.NEW_CONVO;
    loadPersonaFromStorage(convoId);

    const handlePersonaUpdate = () => {
      loadPersonaFromStorage(convoId);
    };

    window.addEventListener('personaUpdated', handlePersonaUpdate);
    return () => {
      window.removeEventListener('personaUpdated', handlePersonaUpdate);
    };
  }, [conversationId]);

  const loadPersonaFromStorage = useCallback((convoId: string) => {
    let personaData = localStorage.getItem(`persona_data_${convoId}`);

    if (!personaData && convoId !== Constants.NEW_CONVO) {
      personaData = localStorage.getItem(`persona_data_${Constants.NEW_CONVO}`);
    }

    if (personaData) {
      try {
        const data = JSON.parse(personaData);
        setSelectedPersona(data.persona || data.name || DEFAULT_PERSONA);
      } catch (e) {
        setSelectedPersona(DEFAULT_PERSONA);
      }
    } else {
      setSelectedPersona(DEFAULT_PERSONA);
    }
  }, []);

  const handleSelectPersona = async (persona: SavedPersona) => {
    const convoId = conversationId || Constants.NEW_CONVO;

    const personaData = {
      persona: persona.name,
      name: persona.name,
      description: persona.description || '',
      detailedPrompt: persona.detailedPrompt || persona.description || persona.name,
      content: { custom: persona.detailedPrompt || persona.description || persona.name },
    };

    localStorage.setItem(`persona_data_${convoId}`, JSON.stringify(personaData));
    window.dispatchEvent(new Event('personaUpdated'));
    setSelectedPersona(persona.name);
    console.log('✅ Persona selected and stored:', persona.name, personaData);
    setIsOpen(false);
  };

  const handleClearPersona = () => {
    const convoId = conversationId || Constants.NEW_CONVO;

    const fiaDefaultPersona = personas.find((p) => p.name === DEFAULT_PERSONA);

    if (fiaDefaultPersona) {
      const defaultPersonaData = {
        persona: fiaDefaultPersona.name,
        name: fiaDefaultPersona.name,
        description: fiaDefaultPersona.description || '',
        detailedPrompt:
          fiaDefaultPersona.detailedPrompt ||
          fiaDefaultPersona.description ||
          fiaDefaultPersona.name,
        content: {
          custom:
            fiaDefaultPersona.detailedPrompt ||
            fiaDefaultPersona.description ||
            fiaDefaultPersona.name,
        },
      };

      localStorage.setItem(`persona_data_${convoId}`, JSON.stringify(defaultPersonaData));
      console.log('🔄 Reset to FIA (Default) persona:', defaultPersonaData);
    } else {
      localStorage.removeItem(`persona_data_${convoId}`);
      console.log('🗑️ Persona cleared (FIA Default not found)');
    }

    window.dispatchEvent(new Event('personaUpdated'));
    setSelectedPersona(DEFAULT_PERSONA);
    setIsOpen(false);
  };

  const handleSaveNewPersona = async (persona: any) => {
    try {
      await saasApi.createPersona(persona);
      console.log('✅ New persona created:', persona);

      showToast({
        message: 'Agent created',
        status: 'success',
      });

      const response = await saasApi.getPersonas();
      let personasArray: any[] = [];
      if (response) {
        if (Array.isArray(response)) {
          personasArray = response;
        } else {
          const responseAny = response as any;
          if (responseAny.data && Array.isArray(responseAny.data)) {
            personasArray = responseAny.data;
          }
        }
      }

      if (personasArray.length > 0) {
        const parsedPersonas: SavedPersona[] = personasArray.map((item: any) => {
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
            name: item.name || item.persona || 'Unnamed Persona',
            description: item.description || '',
            detailedPrompt: detailedPrompt || item.name || '',
          };
        });

        setPersonas(parsedPersonas);
      }

      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create persona:', error);
      throw error;
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const uniquePersonas = personas.filter(
    (p, idx, arr) => arr.findIndex((q) => q.name === p.name) === idx,
  );

  const filteredPersonas = uniquePersonas.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const buttonText = selectedPersona
    ? ` ${selectedPersona}`
    : personas.length > 0
      ? 'Pick Agent'
      : 'No Agent';

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="flex h-8 items-center gap-1.5 rounded-[2px] border border-fig-Stroke-soft bg-transparent px-1.5 text-sm font-normal leading-5 text-fig-Subject-standard opacity-50"
      >
        <User className="h-4 w-4" />
        <span>Loading...</span>
      </button>
    );
  }

  if (personas.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="flex h-[var(--Size-input)] items-center gap-1.5 rounded-[2px] border border-fig-Stroke-soft bg-transparent px-1.5 text-sm font-normal leading-5 text-fig-Subject-standard opacity-50"
        title="No personas available"
      >
        <span>{buttonText}</span>
      </button>
    );
  }

  return (
    <>
      <Ariakit.MenuProvider store={menu}>
        <Ariakit.MenuButton className="flex h-[var(--Size-input)] items-center gap-[var(--Gap-zero-group)] rounded-[2px] border border-fig-Stroke-soft bg-transparent px-[var(--Padding-zero-spacer)] text-sm font-normal leading-5 text-fig-Subject-standard transition-colors hover:bg-fig-Surface-one-standard">
          <span>{buttonText}</span>
          <ChevronDown className="h-4 w-4" />
        </Ariakit.MenuButton>

        <Ariakit.Menu
          id="persona-selector"
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
          {/* Search box */}
          <div className="shrink-0 bg-fig-Surface-one-standard p-[var(--Padding-zero-parentChild)]">
            <div
              className={cn(
                'flex h-[var(--Size-input)] items-center gap-[var(--Gap-zero-parentChild)]',
                'rounded-[var(--Corner-moderatelyRounded)] border border-fig-Stroke-soft bg-fig-Surface-standard',
                'px-[var(--Padding-zero-spacer)]',
              )}
            >
              <Search
                className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] shrink-0 text-fig-Subject-standard"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => {
                  searchQueryRef.current = e.target.value;
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onKeyUp={(e) => e.stopPropagation()}
                onKeyPress={(e) => e.stopPropagation()}
                autoComplete="off"
                className={cn(
                  'fy-typography-body-small min-w-0 flex-1 bg-transparent',
                  '!text-fig-Subject-standard placeholder:text-fig-Subject-soft',
                  'focus:outline-none',
                )}
              />
            </div>
          </div>

          {/* "Select agent" section header */}
          <div className="shrink-0 bg-fig-Surface-one-standard px-[var(--Padding-zero-parentChild)] pb-[var(--Padding-zero-parentChild)]">
            <p className="fy-typography-title-tiny text-fig-Subject-standard">{'Select agent'}</p>
          </div>

          {/* Scrollable list */}
          <div className="max-h-[320px] overflow-y-auto">
            {filteredPersonas.map((persona) => (
              <button
                key={`persona-${persona.name}`}
                type="button"
                className={cn(
                  'fy-typography-label-small flex w-full cursor-pointer items-center',
                  'bg-fig-Surface-standard px-[var(--Padding-spacer)] py-[var(--Padding-boundary)]',
                  '!text-fig-Subject-standard outline-none',
                  'transition-colors hover:bg-fig-Surface-one-standard focus:bg-fig-Surface-one-standard',
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectPersona(persona);
                }}
              >
                {persona.name}
              </button>
            ))}

            {filteredPersonas.length === 0 && (
              <div className="fy-typography-body-small px-[var(--Padding-spacer)] py-[var(--Padding-boundary)] text-fig-Subject-soft">
                {'No agents found'}
              </div>
            )}
            {/* Create new agent */}
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
              {'Create new agent'}
              <ChevronRight
                className="h-[var(--Size-zero-icon)] w-[var(--Size-zero-icon)] shrink-0 text-fig-Subject-neutral"
                aria-hidden
              />
            </button>

            {/* Reset to default (when non-default is selected) */}
            {selectedPersona && selectedPersona !== DEFAULT_PERSONA && (
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
                    handleClearPersona();
                  }}
                >
                  {'Reset to default'}
                </button>
              </>
            )}
          </div>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>

      {showCreateModal && (
        <CreatePersonaModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleSaveNewPersona}
        />
      )}
    </>
  );
}
