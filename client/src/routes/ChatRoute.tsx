import { useEffect, useRef } from 'react';
import { Spinner } from '@librechat/client';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type { TPreset } from 'librechat-data-provider';
import { useGetConvoIdQuery, useGetStartupConfig, useGetEndpointsQuery } from '~/data-provider';
import { useNewConvo, useAppStartup, useAssistantListMap, useIdChangeEffect } from '~/hooks';
import { getDefaultModelSpec, getModelSpecPreset, logger } from '~/utils';
import { ToolCallsMapProvider } from '~/Providers';
import ChatView from '~/components/Chat/ChatView';
import useAuthRedirect from './useAuthRedirect';
import temporaryStore from '~/store/temporary';
import { useRecoilCallback } from 'recoil';
import store from '~/store';

export default function ChatRoute() {
  const { data: startupConfig } = useGetStartupConfig();
  const { isAuthenticated, user } = useAuthRedirect();
  const navigate = useNavigate();
  const location = useLocation();

  const setIsTemporary = useRecoilCallback(
    ({ set }) =>
      (value: boolean) => {
        set(temporaryStore.isTemporary, value);
      },
    [],
  );
  useAppStartup({ startupConfig, user });

  const index = 0;
  const { conversationId = '' } = useParams();
  useIdChangeEffect(conversationId);
  const { hasSetConversation, conversation } = store.useCreateConversationAtom(index);
  const { newConversation } = useNewConvo();
  const hasHandledError = useRef(false);
  const previousConvoIdRef = useRef(conversationId);
  const isNewChatRef = useRef(conversationId === Constants.NEW_CONVO || conversationId === 'new');

  const modelsQuery = useGetModelsQuery({
    enabled: isAuthenticated,
    refetchOnMount: 'always',
  });
  
  // Only fetch existing conversation if it's NOT a new chat
  const shouldFetchInitialConvo =
    isAuthenticated && 
    conversationId !== Constants.NEW_CONVO && 
    conversationId !== 'new' && 
    !hasSetConversation.current;

  const initialConvoQuery = useGetConvoIdQuery(conversationId, {
    enabled: shouldFetchInitialConvo,
  });
  
  const endpointsQuery = useGetEndpointsQuery({ enabled: isAuthenticated });
  const assistantListMap = useAssistantListMap();

  const isTemporaryChat = conversation && conversation.expiredAt ? true : false;

  // Track if we're on a new chat and prevent unwanted navigation
  useEffect(() => {
    const currentIsNewChat = conversationId === Constants.NEW_CONVO || conversationId === 'new';
    
    if (currentIsNewChat) {
      isNewChatRef.current = true;
      // Clear localStorage when entering new chat to prevent restoration
      localStorage.removeItem('lastConversationId');
      sessionStorage.removeItem('lastConversationId');
      logger.log('conversation', 'Entered new chat, cleared localStorage/sessionStorage');
    } else {
      isNewChatRef.current = false;
      // Save the conversation ID when leaving new chat
      if (previousConvoIdRef.current === Constants.NEW_CONVO || previousConvoIdRef.current === 'new') {
        localStorage.setItem('lastConversationId', conversationId);
      }
    }
  }, [conversationId]);

  // Reset state when conversationId changes
  useEffect(() => {
    if (previousConvoIdRef.current !== conversationId) {
      logger.log('conversation', 'conversationId changed', {
        previous: previousConvoIdRef.current,
        current: conversationId,
        isNewChat: isNewChatRef.current,
      });
      previousConvoIdRef.current = conversationId;
      hasHandledError.current = false;
      
      // Reset conversation if moving to a new chat
      if (conversationId === Constants.NEW_CONVO || conversationId === 'new') {
        hasSetConversation.current = false;
        logger.log('conversation', 'Reset hasSetConversation for new chat');
      }
    }
  }, [conversationId]);

  // Prevent navigation away from new chat if URL somehow gets changed
  useEffect(() => {
    if (isNewChatRef.current && (conversationId !== Constants.NEW_CONVO && conversationId !== 'new')) {
      logger.warn('conversation', 'Detected unwanted navigation away from new chat', {
        current: conversationId,
        expected: Constants.NEW_CONVO,
      });
      // Force back to new chat
      navigate('/c/new', { replace: true });
    }
  }, [conversationId, navigate]);

  // Handle deleted conversations or fetch errors
  useEffect(() => {
    if (!shouldFetchInitialConvo) {
      return;
    }

    if (
      initialConvoQuery.isError &&
      initialConvoQuery.isFetched &&
      !hasHandledError.current
    ) {
      hasHandledError.current = true;
      logger.log('conversation', 'Conversation not found or deleted, redirecting to new chat', {
        conversationId,
        error: initialConvoQuery.error,
      });
      
      // Clear all stored conversation IDs
      localStorage.removeItem('lastConversationId');
      sessionStorage.removeItem('lastConversationId');
      
      // Navigate to new conversation
      navigate('/c/new', { replace: true });
    }
  }, [
    initialConvoQuery.isError,
    initialConvoQuery.isFetched,
    initialConvoQuery.error,
    conversationId,
    shouldFetchInitialConvo,
    navigate,
  ]);

  // Update temporary chat state
  useEffect(() => {
    if (conversationId !== Constants.NEW_CONVO && !isTemporaryChat) {
      setIsTemporary(false);
    } else if (isTemporaryChat) {
      setIsTemporary(isTemporaryChat);
    }
  }, [conversationId, isTemporaryChat, setIsTemporary]);

  // Initialize conversation
  useEffect(() => {
    const shouldSetConvo =
      (startupConfig && !hasSetConversation.current && !modelsQuery.data?.initial) ?? false;
    
    if (!shouldSetConvo) {
      return;
    }

    if (conversationId === Constants.NEW_CONVO && endpointsQuery.data && modelsQuery.data) {
      const result = getDefaultModelSpec(startupConfig);
      const spec = result?.default ?? result?.last;
      logger.log('conversation', 'ChatRoute, new convo effect', conversation);
      newConversation({
        modelsData: modelsQuery.data,
        template: conversation ? conversation : undefined,
        ...(spec ? { preset: getModelSpecPreset(spec) } : {}),
      });

      hasSetConversation.current = true;
    } else if (initialConvoQuery.data && endpointsQuery.data && modelsQuery.data) {
      logger.log('conversation', 'ChatRoute initialConvoQuery', initialConvoQuery.data);
      newConversation({
        template: initialConvoQuery.data,
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
      });
      hasSetConversation.current = true;
    } else if (
      conversationId === Constants.NEW_CONVO &&
      assistantListMap[EModelEndpoint.assistants] &&
      assistantListMap[EModelEndpoint.azureAssistants]
    ) {
      const result = getDefaultModelSpec(startupConfig);
      const spec = result?.default ?? result?.last;
      logger.log('conversation', 'ChatRoute new convo, assistants effect', conversation);
      newConversation({
        modelsData: modelsQuery.data,
        template: conversation ? conversation : undefined,
        ...(spec ? { preset: getModelSpecPreset(spec) } : {}),
      });
      hasSetConversation.current = true;
    } else if (
      assistantListMap[EModelEndpoint.assistants] &&
      assistantListMap[EModelEndpoint.azureAssistants]
    ) {
      logger.log('conversation', 'ChatRoute convo, assistants effect', initialConvoQuery.data);
      newConversation({
        template: initialConvoQuery.data,
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
      });
      hasSetConversation.current = true;
    }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startupConfig,
    initialConvoQuery.data,
    endpointsQuery.data,
    modelsQuery.data,
    assistantListMap,
  ]);

  if (endpointsQuery.isLoading || modelsQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" aria-live="polite" role="status">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // if not a conversation
  if (conversation?.conversationId === Constants.SEARCH) {
    return null;
  }
  
  // if conversationId not match
  if (conversation?.conversationId !== conversationId && !conversation) {
    return null;
  }
  
  // if conversationId is null
  if (!conversationId) {
    return null;
  }

  return (
    <ToolCallsMapProvider conversationId={conversation.conversationId ?? ''}>
      <ChatView index={index} />
    </ToolCallsMapProvider>
  );
}