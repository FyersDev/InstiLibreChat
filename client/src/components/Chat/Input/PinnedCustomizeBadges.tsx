import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Check, User, FileText, Layout } from 'lucide-react';
import { cn } from '~/utils';

interface CustomizeBadgesProps {
  conversationId?: string | null;
  onRemove?: (type: 'persona' | 'template' | 'documents') => void;
}

const CustomizeBadges: React.FC<CustomizeBadgesProps> = ({ 
  conversationId, 
  onRemove 
}) => {
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for customize changes from other components
  useEffect(() => {
    const handleCustomizeChange = () => {
      setRefreshKey(prev => prev + 1);
    };

    // Listen for custom events
    window.addEventListener('customizeChanged', handleCustomizeChange);
    
    // Also listen for storage changes in case of external updates
    window.addEventListener('storage', handleCustomizeChange);

    // Ensure persona data is preserved during page load and refreshes
    const key = conversationId || 'new';
    const personaData = localStorage.getItem(`persona_data_${key}`);
    if (personaData && personaData.trim()) {
      // If there's persona data, make sure the persona toggle is enabled
      const personaToggleKey = `last_persona_toggle_${key}`;
      localStorage.setItem(personaToggleKey, JSON.stringify(true));
    }

    return () => {
      window.removeEventListener('customizeChanged', handleCustomizeChange);
      window.removeEventListener('storage', handleCustomizeChange);
    };
  }, [conversationId]);

  // Get current customization state - always show if any exist (no pinning needed)
  const customizationState = useMemo(() => {
    const key = conversationId || 'new';
    const personaData = localStorage.getItem(`persona_data_${key}`);
    const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
    
    const badges: Array<{
      type: 'persona' | 'template' | 'documents';
      label: string;
      icon: React.ReactNode;
      color: string;
    }> = [];
    
    // Check for persona
    if (personaData && personaData.trim()) {
      // Try to find persona name
      const saved = localStorage.getItem('saved_personas');
      const parsedSaved = saved ? JSON.parse(saved) : [];
      const defaultPersonas = [
        {
          name: 'FIA (default)',
          description: 'A helpful AI assistant that provides balanced and informative responses.',
          detailedPrompt: 'You are a helpful AI assistant that provides balanced and informative responses. Focus on being accurate, clear, and helpful in all interactions.'
        },
        {
          name: 'Risk manager',
          description: 'An expert in risk assessment and management, focusing on identifying, analyzing, and mitigating potential risks in various scenarios.',
          detailedPrompt: 'You are a seasoned risk manager with 15+ years of experience in enterprise risk management. You excel at identifying potential risks, analyzing their impact and probability, and developing comprehensive mitigation strategies. Focus on quantitative risk assessment, regulatory compliance, and strategic risk planning. Always consider both financial and operational risks in your analysis.'
        },
        {
          name: 'Investment advisor',
          description: 'A knowledgeable financial advisor specializing in investment strategies, portfolio management, and market analysis.',
          detailedPrompt: 'You are an experienced investment advisor with deep expertise in portfolio management, asset allocation, and market analysis. Provide data-driven investment recommendations, analyze market trends, and help with portfolio optimization. Focus on risk-adjusted returns, diversification strategies, and long-term wealth building. Always consider the client\'s risk tolerance and investment timeline.'
        },
        {
          name: 'Technical analyst',
          description: 'An expert in technical analysis, chart patterns, market trends, and trading strategies using quantitative methods.',
          detailedPrompt: 'You are a skilled technical analyst with expertise in chart pattern recognition, technical indicators, and quantitative trading strategies. Analyze price movements, identify support and resistance levels, and provide insights on market timing. Use technical indicators like RSI, MACD, moving averages, and Fibonacci retracements in your analysis. Focus on actionable trading insights and risk management.'
        },
        {
          name: 'ESG specialist',
          description: 'An expert in Environmental, Social, and Governance (ESG) factors, sustainable investing, and corporate responsibility.',
          detailedPrompt: 'You are an ESG specialist with comprehensive knowledge of Environmental, Social, and Governance factors in investment decisions. Evaluate companies based on their sustainability practices, social impact, and governance structures. Provide insights on ESG scoring, sustainable investment strategies, and corporate responsibility trends. Focus on long-term value creation through responsible investing.'
        },
      ];
      const allPersonas = [...parsedSaved, ...defaultPersonas];
      const current = allPersonas.find(p => p.detailedPrompt === personaData);
      const personaName = current ? current.name : 'Custom (pinned)';
      
      badges.push({
        type: 'persona',
        label: personaName,
        icon: <User className="w-3 h-3" />,
        color: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
      });
    }
    
    // Check for template and documents
    if (documentDataStr) {
      try {
        const documentData = JSON.parse(documentDataStr);
        
        if (documentData.template && documentData.template.trim()) {
          badges.push({
            type: 'template',
            label: documentData.template,
            icon: <Layout className="w-3 h-3" />,
            color: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'
          });
        }
        
        if (documentData.documents && documentData.documents.length > 0) {
          const docCount = documentData.documents.length;
          badges.push({
            type: 'documents',
            label: `${docCount} doc${docCount !== 1 ? 's' : ''}`,
            icon: <FileText className="w-3 h-3" />,
            color: 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200'
          });
        }
      } catch (error) {
        console.error('Error parsing document data:', error);
      }
    }
    
    return badges;
  }, [conversationId, refreshKey]);

  const handleRemove = useCallback((type: 'persona' | 'template' | 'documents') => {
    const key = conversationId || 'new';
    
    if (type === 'persona') {
      localStorage.removeItem(`persona_data_${key}`);
    } else if (type === 'template') {
      const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
      if (documentDataStr) {
        try {
          const documentData = JSON.parse(documentDataStr);
          delete documentData.template;
          if (documentData.documents && documentData.documents.length > 0) {
            localStorage.setItem(`persona_documents_${key}`, JSON.stringify(documentData));
          } else {
            localStorage.removeItem(`persona_documents_${key}`);
          }
        } catch (error) {
          console.error('Error updating document data:', error);
        }
      }
    } else if (type === 'documents') {
      const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
      if (documentDataStr) {
        try {
          const documentData = JSON.parse(documentDataStr);
          delete documentData.documents;
          if (documentData.template && documentData.template.trim()) {
            localStorage.setItem(`persona_documents_${key}`, JSON.stringify(documentData));
          } else {
            localStorage.removeItem(`persona_documents_${key}`);
          }
        } catch (error) {
          console.error('Error updating document data:', error);
        }
      }
    }
    
    // Refresh the display and notify other components
    setTimeout(() => {
      setRefreshKey(prev => prev + 1);
      window.dispatchEvent(new CustomEvent('customizeChanged'));
      onRemove?.(type);
    }, 50);
  }, [conversationId, onRemove]);

  if (customizationState.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {customizationState.map((badge) => (
        <button
          key={badge.type}
          onClick={()=>{}}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer h-7',
            badge.color
          )}
          title={`${badge.type}`}
        >
          <Check className="w-3 h-3" />
          {badge.icon}
          <span>{badge.label}</span>
          <span
            className="w-3 h-3 cursor-pointer hover:text-red-500" 
            onClick={(e) => {
              e.stopPropagation();
              handleRemove(badge.type);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  );
};

export default CustomizeBadges;
