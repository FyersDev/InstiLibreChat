import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, User, Plus } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import { DropdownPopup } from '@librechat/client';
import { saasApi } from '~/services/saasApi';
import { useParams, useNavigate } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';

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
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const hasInitialized = useRef(false);

  // Fetch personas once on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const fetchData = async () => {
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
              name: item.name || item.persona || 'Unnamed Persona',
              description: item.description || '',
              detailedPrompt: detailedPrompt || item.name || ''
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
    };

    fetchData();
  }, []);

  // Auto-set FIA (Default) persona when personas are loaded and no persona is stored
  useEffect(() => {
    if (personas.length === 0 || loading) return;

    const convoId = conversationId || Constants.NEW_CONVO;
    const personaData = localStorage.getItem(`persona_data_${convoId}`);
    
    // Only set default if no persona is stored for this conversation
    if (!personaData) {
      const fiaDefaultPersona = personas.find(p => p.name === DEFAULT_PERSONA);
      
      if (fiaDefaultPersona) {
        const defaultPersonaData = {
          persona: fiaDefaultPersona.name,
          name: fiaDefaultPersona.name,
          description: fiaDefaultPersona.description || '',
          detailedPrompt: fiaDefaultPersona.detailedPrompt || fiaDefaultPersona.description || fiaDefaultPersona.name,
          content: { custom: fiaDefaultPersona.detailedPrompt || fiaDefaultPersona.description || fiaDefaultPersona.name }
        };
        
        localStorage.setItem(`persona_data_${convoId}`, JSON.stringify(defaultPersonaData));
        console.log('FIA (Default) persona automatically set for conversation:', convoId, defaultPersonaData);
        window.dispatchEvent(new Event('personaUpdated'));
      } else {
        console.warn('[PersonaSelector] FIA (Default) persona not found in fetched personas');
      }
    }
  }, [personas, conversationId, loading]);

  // Load and sync selected persona - only when conversationId changes
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
    
    // Fallback to NEW_CONVO if current convo doesn't have data (handles migration timing)
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
      content: { custom: persona.detailedPrompt || persona.description || persona.name }
    };
    
    localStorage.setItem(`persona_data_${convoId}`, JSON.stringify(personaData));
    window.dispatchEvent(new Event('personaUpdated'));
    setSelectedPersona(persona.name);
    console.log('✅ Persona selected and stored:', persona.name, personaData);
    setIsOpen(false);
  };

  const handleClearPersona = () => {
    const convoId = conversationId || Constants.NEW_CONVO;
    
    // Find FIA (Default) from personas and set it
    const fiaDefaultPersona = personas.find(p => p.name === DEFAULT_PERSONA);
    
    if (fiaDefaultPersona) {
      const defaultPersonaData = {
        persona: fiaDefaultPersona.name,
        name: fiaDefaultPersona.name,
        description: fiaDefaultPersona.description || '',
        detailedPrompt: fiaDefaultPersona.detailedPrompt || fiaDefaultPersona.description || fiaDefaultPersona.name,
        content: { custom: fiaDefaultPersona.detailedPrompt || fiaDefaultPersona.description || fiaDefaultPersona.name }
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

  const getIsPersonaSelected = (persona: SavedPersona): boolean => {
    const convoId = conversationId || Constants.NEW_CONVO;
    let personaDataStr = localStorage.getItem(`persona_data_${convoId}`);
    
    if (!personaDataStr && convoId !== Constants.NEW_CONVO) {
      personaDataStr = localStorage.getItem(`persona_data_${Constants.NEW_CONVO}`);
    }
    
    if (personaDataStr) {
      try {
        const personaData = JSON.parse(personaDataStr);
        return (personaData.persona || personaData.name) === persona.name;
      } catch (e) {
        return false;
      }
    }
    
    return persona.name === DEFAULT_PERSONA;
  };

  const menuItems = [
    ...personas.map((persona) => ({
      label: persona.name,
      onClick: () => handleSelectPersona(persona),
      key: `persona-${persona.name}`,
    })),
    {
      separate: true,
      key: 'separator-create',
    },
    {
      label: 'Create New Agent',
      onClick: () => {
        setIsOpen(false);
        navigate('/templates?tab=personas&action=create');
      },
      key: 'create-persona',
    },
    ...(selectedPersona && selectedPersona !== DEFAULT_PERSONA ? [{
      separate: true,
      key: 'separator',
    }, {
      label: 'Reset to default',
      onClick: handleClearPersona,
      key: 'clear-persona',
    }] : []),
  ];

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-1.5 rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm font-medium text-text-primary opacity-50"
      >
        <User className="h-4 w-4" />
        <span>Loading...</span>
      </button>
    );
  }

  const buttonText = selectedPersona 
    ? ` ${selectedPersona}` 
    : personas.length > 0 
      ? 'Pick Agent' 
      : 'No Agent';

  if (menuItems.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-1.5 rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm font-medium text-text-primary opacity-50"
        title="No personas available"
      >
        <User className="h-4 w-4" />
        <span>{buttonText}</span>
      </button>
    );
  }

  return (
      <DropdownPopup
      portal={true}
      modal={true}
      sameWidth={false}
      gutter={4}
      anchor={{ x: 'start', y: 'bottom' }}
        menuId="persona-selector"
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        trigger={
          <Ariakit.MenuButton
          style={{ height: '34px' }}
          className="flex items-center gap-1.5 rounded-lg border border-border-light bg-transparent px-3 text-sm font-medium text-text-primary transition-all hover:bg-surface-hover"
          >
            <User className="h-4 w-4" />
            <span>{buttonText}</span>
            <ChevronDown className="h-4 w-4" />
          </Ariakit.MenuButton>
        }
        items={menuItems}
        className="w-auto max-w-[280px] max-h-[400px] overflow-y-auto rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2"
        itemClassName="px-4 py-3 text-base hover:bg-gray-100 dark:hover:bg-gray-700"
      />
  );
}