import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSetRecoilState } from 'recoil';
import { Tools, Constants, LocalStorageKeys, AgentCapabilities } from 'librechat-data-provider';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import {
  useMCPServerManager,
  useSearchApiKeyForm,
  useGetAgentsConfig,
  useCodeApiKeyForm,
  useToolToggle,
} from '~/hooks';
import { getTimestampedValue, setTimestamp } from '~/utils/timestamps';
import { ephemeralAgentByConvoId } from '~/store';

interface BadgeRowContextType {
  conversationId?: string | null;
  agentsConfig?: TAgentsEndpoint | null;
  webSearch: ReturnType<typeof useToolToggle>;
  artifacts: ReturnType<typeof useToolToggle>;
  fileSearch: ReturnType<typeof useToolToggle>;
  codeInterpreter: ReturnType<typeof useToolToggle>;
  persona: ReturnType<typeof useToolToggle>;
  codeApiKeyForm: ReturnType<typeof useCodeApiKeyForm>;
  searchApiKeyForm: ReturnType<typeof useSearchApiKeyForm>;
  mcpServerManager: ReturnType<typeof useMCPServerManager>;
}

const BadgeRowContext = createContext<BadgeRowContextType | undefined>(undefined);

export function useBadgeRowContext() {
  const context = useContext(BadgeRowContext);
  if (context === undefined) {
    throw new Error('useBadgeRowContext must be used within a BadgeRowProvider');
  }
  return context;
}

interface BadgeRowProviderProps {
  children: React.ReactNode;
  isSubmitting?: boolean;
  conversationId?: string | null;
}

export default function BadgeRowProvider({
  children,
  isSubmitting,
  conversationId,
}: BadgeRowProviderProps) {
  const lastKeyRef = useRef<string>('');
  const hasInitializedRef = useRef(false);
  const { agentsConfig } = useGetAgentsConfig();
  const key = conversationId ?? Constants.NEW_CONVO;

  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(key));

  /** Initialize ephemeralAgent from localStorage on mount and when conversation changes */
  useEffect(() => {
    // Check if this is a new conversation or the first load
    if (!hasInitializedRef.current || lastKeyRef.current !== key) {
      hasInitializedRef.current = true;
      lastKeyRef.current = key;

      const codeToggleKey = `${LocalStorageKeys.LAST_CODE_TOGGLE_}${key}`;
      const webSearchToggleKey = `${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${key}`;
      const fileSearchToggleKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${key}`;
      const artifactsToggleKey = `${LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_}${key}`;
      const personaToggleKey = `last_persona_toggle_${key}`;

      const codeToggleValue = getTimestampedValue(codeToggleKey);
      const webSearchToggleValue = getTimestampedValue(webSearchToggleKey);
      const fileSearchToggleValue = getTimestampedValue(fileSearchToggleKey);
      const artifactsToggleValue = getTimestampedValue(artifactsToggleKey);
      const personaToggleValue = getTimestampedValue(personaToggleKey);

      const initialValues: Record<string, any> = {};

      if (codeToggleValue !== null) {
        try {
          initialValues[Tools.execute_code] = JSON.parse(codeToggleValue);
        } catch (e) {
          console.error('Failed to parse code toggle value:', e);
        }
      }

      if (webSearchToggleValue !== null) {
        try {
          initialValues[Tools.web_search] = JSON.parse(webSearchToggleValue);
        } catch (e) {
          console.error('Failed to parse web search toggle value:', e);
        }
      }

      if (fileSearchToggleValue !== null) {
        try {
          initialValues[Tools.file_search] = JSON.parse(fileSearchToggleValue);
        } catch (e) {
          console.error('Failed to parse file search toggle value:', e);
        }
      }

      if (artifactsToggleValue !== null) {
        try {
          initialValues[AgentCapabilities.artifacts] = JSON.parse(artifactsToggleValue);
        } catch (e) {
          console.error('Failed to parse artifacts toggle value:', e);
        }
      }

      if (personaToggleValue !== null) {
        try {
          initialValues['persona'] = JSON.parse(personaToggleValue);
        } catch (e) {
          console.error('Failed to parse persona toggle value:', e);
        }
      } else {
        // Fallback: if persona_data exists in localStorage mark persona toggle as true
        const personaData = localStorage.getItem(`persona_data_${key}`);
        if (personaData && personaData.trim()) {
          initialValues['persona'] = true;
        }
      }

      /**
       * Always set values for all tools (use defaults if not in `localStorage`)
       * If `ephemeralAgent` is `null`, create a new object with just our tool values
       */
      const finalValues = {
        [Tools.execute_code]: initialValues[Tools.execute_code] ?? false,
        [Tools.web_search]: initialValues[Tools.web_search] ?? false,
        [Tools.file_search]: initialValues[Tools.file_search] ?? false,
        [AgentCapabilities.artifacts]: initialValues[AgentCapabilities.artifacts] ?? false,
        persona: initialValues['persona'] ?? false,
      };

      setEphemeralAgent((prev) => ({
        ...(prev || {}),
        ...finalValues,
      }));

      Object.entries(finalValues).forEach(([toolKey, value]) => {
        if (value !== false) {
          let storageKey = artifactsToggleKey;
          if (toolKey === Tools.execute_code) {
            storageKey = codeToggleKey;
          } else if (toolKey === Tools.web_search) {
            storageKey = webSearchToggleKey;
          } else if (toolKey === Tools.file_search) {
            storageKey = fileSearchToggleKey;
          } else if (toolKey === 'persona') {
            storageKey = personaToggleKey;
          }
          // Store the value and set timestamp for existing values
          localStorage.setItem(storageKey, JSON.stringify(value));
          setTimestamp(storageKey);
        }
      });
    }
  }, [key, setEphemeralAgent]);

  // Migrate customization storage from the temporary key to real conversation ID
  useEffect(() => {
    const prevKey = lastKeyRef.current;
    if (prevKey === Constants.NEW_CONVO && key !== Constants.NEW_CONVO) {
      // keys to migrate
      const migrate = (
        base: string,
        includePinned = false,
      ) => {
        const oldKey = `${base}${Constants.NEW_CONVO}`;
        const newKey = `${base}${key}`;
        const value = localStorage.getItem(oldKey);
        if (value !== null && localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, value);
        }
        if (includePinned) {
          const oldPinned = `${base}pinned`;
          const newPinned = `${base}pinned`;
          const pinnedVal = localStorage.getItem(oldPinned);
          if (pinnedVal !== null && localStorage.getItem(newPinned) === null) {
            localStorage.setItem(newPinned, pinnedVal);
          }
        }
      };
      migrate(LocalStorageKeys.LAST_CODE_TOGGLE_);
      migrate(LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_);
      migrate(LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_);
      migrate(LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_);
      // persona toggle key (legacy)
      migrate('last_persona_toggle_');
      // persona data & documents
      const personaData = localStorage.getItem(`persona_data_${Constants.NEW_CONVO}`);
      if (personaData !== null) {
        localStorage.setItem(`persona_data_${key}`, personaData);
      }
      const personaDocs = localStorage.getItem(`persona_documents_${Constants.NEW_CONVO}`);
      if (personaDocs !== null) {
        localStorage.setItem(`persona_documents_${key}`, personaDocs);
      }
    }
  }, [key]);

  /** CodeInterpreter hooks */
  const codeApiKeyForm = useCodeApiKeyForm({});
  const { setIsDialogOpen: setCodeDialogOpen } = codeApiKeyForm;

  const codeInterpreter = useToolToggle({
    conversationId,
    setIsDialogOpen: setCodeDialogOpen,
    toolKey: Tools.execute_code,
    localStorageKey: LocalStorageKeys.LAST_CODE_TOGGLE_,
    authConfig: {
      toolId: Tools.execute_code,
      queryOptions: { retry: 1 },
    },
  });

  /** WebSearch hooks */
  const searchApiKeyForm = useSearchApiKeyForm({});
  const { setIsDialogOpen: setWebSearchDialogOpen } = searchApiKeyForm;

  const webSearch = useToolToggle({
    conversationId,
    toolKey: Tools.web_search,
    localStorageKey: LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_,
    setIsDialogOpen: setWebSearchDialogOpen,
    authConfig: {
      toolId: Tools.web_search,
      queryOptions: { retry: 1 },
    },
  });

  /** FileSearch hook */
  const fileSearch = useToolToggle({
    conversationId,
    toolKey: Tools.file_search,
    localStorageKey: LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_,
    isAuthenticated: true,
  });

  /** Artifacts hook - using a custom key since it's not a Tool but a capability */
  const artifacts = useToolToggle({
    conversationId,
    toolKey: AgentCapabilities.artifacts,
    localStorageKey: LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_,
    isAuthenticated: true,
  });

  /** Persona hook */
  const persona = useToolToggle({
    conversationId,
    toolKey: 'persona' as any,
    localStorageKey: 'last_persona_toggle_' as any,
    isAuthenticated: true,
  });

  const mcpServerManager = useMCPServerManager({ conversationId });

  const value: BadgeRowContextType = {
    webSearch,
    artifacts,
    fileSearch,
    agentsConfig,
    conversationId,
    codeApiKeyForm,
    codeInterpreter,
    persona,
    searchApiKeyForm,
    mcpServerManager,
  };

  return <BadgeRowContext.Provider value={value}>{children}</BadgeRowContext.Provider>;
}
