import { useMemo, useCallback } from 'react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetAssistantDocsQuery, useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint, getEntity } from '~/utils';
import { useSubmitMessage } from '~/hooks';
import { TrendingUp, FileText } from 'lucide-react';

const ConversationStarters = () => {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (
      [
        EModelEndpoint.chatGPTBrowser,
        EModelEndpoint.azureOpenAI,
        EModelEndpoint.gptPlugins,
      ].includes(ep as EModelEndpoint)
    ) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  // Always show the custom feature cards for FIA
  const featureCards = [
    {
      title: 'Market analysis',
      description: 'Real-time insights',
      icon: TrendingUp,
      prompt: 'Provide a comprehensive market analysis including current trends, key indicators, and investment opportunities.'
    },
    {
      title: 'Document intelligence',
      description: 'AI-powered analysis',
      icon: FileText,
      prompt: 'Help me analyze and extract insights from documents using AI-powered document intelligence.'
    }
  ];

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-6 px-4 max-w-2xl mx-auto">
      {featureCards.map((card, index) => {
        const IconComponent = card.icon;
        return (
          <button
            key={index}
            onClick={() => sendConversationStarter(card.prompt)}
            className="relative flex w-72 cursor-pointer flex-col gap-3 rounded-2xl border border-border-medium px-6 py-5 text-start align-top shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-all duration-300 ease-in-out hover:bg-surface-tertiary hover:shadow-lg hover:-translate-y-1 group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                <IconComponent className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary text-base mb-1">{card.title}</h3>
                <p className="text-sm text-text-secondary">{card.description}</p>
              </div>
            </div>
          </button>
        );
      })}
      
      {/* Show original conversation starters if they exist */}
      {conversation_starters.length > 0 && (
        <div className="w-full mt-4">
          <div className="flex flex-wrap justify-center gap-3">
            {conversation_starters
              .slice(0, Constants.MAX_CONVO_STARTERS)
              .map((text: string, index: number) => (
                <button
                  key={`original-${index}`}
                  onClick={() => sendConversationStarter(text)}
                  className="relative flex w-40 cursor-pointer flex-col gap-2 rounded-2xl border border-border-medium px-3 pb-4 pt-3 text-start align-top text-[15px] shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 ease-in-out fade-in hover:bg-surface-tertiary"
                >
                  <p className="break-word line-clamp-3 overflow-hidden text-balance break-all text-text-secondary">
                    {text}
                  </p>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationStarters;
