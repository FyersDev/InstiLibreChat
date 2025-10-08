import React, { memo, useState, useEffect, useMemo } from 'react';
import { Settings, User, FileText, Layout } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import PersonaDialog from './PersonaDialog';

interface SavedPersona {
  name: string;
  description: string;
  detailedPrompt: string;
}

interface IndividualBadgeProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
  className?: string;
}

const IndividualBadge = ({ icon: Icon, label, isActive, onClick, onRemove, className = '' }: IndividualBadgeProps) => {
  return (
    <div className="relative group cursor-pointer">
      <div onClick={onClick}>
        <CheckboxButton
          className={`max-w-fit ${className}`}
          checked={isActive}
          setValue={() => {}} // Disabled toggle
          label={label}
          isCheckedClassName="border-green-600/40 bg-green-500/10 hover:bg-green-700/10"
          icon={<Icon className="icon-md" />}
        />
      </div>
      {isActive && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors z-10 border-2 border-white"
          title="Remove"
        >
          <span className="text-sm font-bold leading-none">×</span>
        </button>
      )}
    </div>
  );
};

function Persona() {
  const localize = useLocalize();
  const { persona, conversationId } = useBadgeRowContext();
  const { toggleState: personaEnabled, debouncedChange, isPinned } = persona;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPersonaName, setSelectedPersonaName] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0); // Add refresh key to force re-renders

  // Default personas
  const defaultPersonas: SavedPersona[] = [
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

  useEffect(() => {
    // Check what persona is currently active for this conversation
    const key = conversationId || 'new';
    const currentPersona = localStorage.getItem(`persona_data_${key}`) || '';
    const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
    
    // Check if we have any customizations (persona, template, or documents)
    let hasPersona = !!(currentPersona && currentPersona.trim());
    let hasTemplate = false;
    let hasDocuments = false;
    
    if (documentDataStr) {
      try {
        const documentData = JSON.parse(documentDataStr);
        hasTemplate = !!(documentData.template && documentData.template.trim());
        hasDocuments = !!(documentData.documents && documentData.documents.length > 0);
      } catch (error) {
        console.error('Error parsing document data:', error);
      }
    }
    
    const hasAnyCustomization = hasPersona || hasTemplate || hasDocuments;
    
    if (hasPersona) {
      // Load saved personas from localStorage
      const saved = localStorage.getItem('saved_personas');
      const parsedSaved = saved ? JSON.parse(saved) : [];
      const allPersonas = [...defaultPersonas, ...parsedSaved];
      
      // Find which persona is currently selected
      const current = allPersonas.find(p => p.detailedPrompt === currentPersona);
      setSelectedPersonaName(current ? current.name : 'Custom');
    } else {
      setSelectedPersonaName('');
    }
    
    // Enable persona toggle if there's any customization
    if (hasAnyCustomization && !personaEnabled) {
      debouncedChange({ value: true });
    } else if (!hasAnyCustomization && personaEnabled) {
      // Disable persona toggle if there are no customizations
      debouncedChange({ value: false });
    }
  }, [conversationId, dialogOpen, personaEnabled, debouncedChange, refreshKey]); // Add refreshKey dependency

  const handleToggle = ({ value }: { value: string | boolean }) => {
    const boolValue = typeof value === 'string' ? value === 'true' : value;
    
    // If enabling, just open the dialog
    if (boolValue) {
      debouncedChange({ value: true });
      setDialogOpen(true);
    } else {
      // If disabling, clear all data
      const key = conversationId || 'new';
      localStorage.removeItem(`persona_data_${key}`);
      localStorage.removeItem(`persona_documents_${key}`);
      setSelectedPersonaName('');
      debouncedChange({ value: false });
    }
  };

  const handleBadgeClick = () => {
    // Always open dialog for editing when badge is clicked
    setDialogOpen(true);
  };

  // Individual removal functions
  const handleRemovePersona = () => {
    const key = conversationId || 'new';
    localStorage.removeItem(`persona_data_${key}`);
    setSelectedPersonaName('');
    
    // Check if we still have template or documents
    const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
    let hasTemplate = false;
    let hasDocuments = false;
    
    if (documentDataStr) {
      try {
        const documentData = JSON.parse(documentDataStr);
        hasTemplate = !!(documentData.template && documentData.template.trim());
        hasDocuments = !!(documentData.documents && documentData.documents.length > 0);
      } catch (error) {
        console.error('Error parsing document data:', error);
      }
    }
    
    // If no template or documents, disable the persona toggle
    if (!hasTemplate && !hasDocuments && personaEnabled) {
      debouncedChange({ value: false });
    }
    
    // Force re-render
    setRefreshKey(prev => prev + 1);
  };

  const handleRemoveTemplate = () => {
    const key = conversationId || 'new';
    const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
    
    if (documentDataStr) {
      try {
        const documentData = JSON.parse(documentDataStr);
        delete documentData.template;
        
        // If no documents left, remove the entire entry
        if (!documentData.documents || documentData.documents.length === 0) {
          localStorage.removeItem(`persona_documents_${key}`);
        } else {
          localStorage.setItem(`persona_documents_${key}`, JSON.stringify(documentData));
        }
        
        // Check if we still have persona or documents
        const personaData = localStorage.getItem(`persona_data_${key}`);
        const hasPersona = !!(personaData && personaData.trim());
        const hasDocuments = !!(documentData.documents && documentData.documents.length > 0);
        
        // If no persona or documents, disable the persona toggle
        if (!hasPersona && !hasDocuments && personaEnabled) {
          debouncedChange({ value: false });
        }
      } catch (error) {
        console.error('Error parsing document data:', error);
      }
    }
    
    // Force re-render
    setRefreshKey(prev => prev + 1);
  };

  const handleRemoveDocuments = () => {
    const key = conversationId || 'new';
    const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
    
    if (documentDataStr) {
      try {
        const documentData = JSON.parse(documentDataStr);
        delete documentData.documents;
        
        // If no template left, remove the entire entry
        if (!documentData.template || !documentData.template.trim()) {
          localStorage.removeItem(`persona_documents_${key}`);
        } else {
          localStorage.setItem(`persona_documents_${key}`, JSON.stringify(documentData));
        }
        
        // Check if we still have persona or template
        const personaData = localStorage.getItem(`persona_data_${key}`);
        const hasPersona = !!(personaData && personaData.trim());
        const hasTemplate = !!(documentData.template && documentData.template.trim());
        
        // If no persona or template, disable the persona toggle
        if (!hasPersona && !hasTemplate && personaEnabled) {
          debouncedChange({ value: false });
        }
      } catch (error) {
        console.error('Error parsing document data:', error);
      }
    }
    
    // Force re-render
    setRefreshKey(prev => prev + 1);
  };

  const componentStates = useMemo(() => {
    const key = conversationId || 'new';
    const personaData = localStorage.getItem(`persona_data_${key}`);
    const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
    
    let hasPersona = false;
    let hasTemplate = false;
    let docCount = 0;
    let templateName = '';
    
    // Check for persona
    if (personaData && personaData.trim()) {
      hasPersona = true;
    }
    
    // Check for template and documents
    if (documentDataStr) {
      try {
        const documentData = JSON.parse(documentDataStr);
        if (documentData.template && documentData.template.trim()) {
          hasTemplate = true;
          templateName = documentData.template;
        }
        if (documentData.documents && documentData.documents.length > 0) {
          docCount = documentData.documents.length;
        }
      } catch (error) {
        console.error('Error parsing document data:', error);
      }
    }
    
    return {
      hasPersona,
      hasTemplate,
      hasDocuments: docCount > 0,
      personaName: selectedPersonaName || 'Custom',
      templateName,
      docCount
    };
  }, [conversationId, selectedPersonaName, refreshKey]); // Add refreshKey dependency
  const hasAnyComponent = componentStates.hasPersona || componentStates.hasTemplate || componentStates.hasDocuments;

  // Show customize button if nothing is selected
  if (!hasAnyComponent) {
    return (
      <>
        <div onClick={handleBadgeClick} className="cursor-pointer">
          <CheckboxButton
            className="max-w-fit"
            checked={false}
            setValue={handleToggle}
            label="Customize"
            isCheckedClassName="border-green-600/40 bg-green-500/10 hover:bg-green-700/10"
            icon={<Settings className="icon-md" />}
          />
        </div>
        <PersonaDialog
          isOpen={dialogOpen}
          setIsOpen={setDialogOpen}
          conversationId={conversationId}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {componentStates.hasPersona && (
          <IndividualBadge
            icon={User}
            label={componentStates.personaName}
            isActive={true}
            onClick={handleBadgeClick}
            onRemove={handleRemovePersona}
          />
        )}
        
        {componentStates.hasTemplate && (
          <IndividualBadge
            icon={Layout}
            label={componentStates.templateName}
            isActive={true}
            onClick={handleBadgeClick}
            onRemove={handleRemoveTemplate}
          />
        )}
        
        {componentStates.hasDocuments && (
          <IndividualBadge
            icon={FileText}
            label={`${componentStates.docCount} doc${componentStates.docCount !== 1 ? 's' : ''}`}
            isActive={true}
            onClick={handleBadgeClick}
            onRemove={handleRemoveDocuments}
          />
        )}
        
        {/* Add button to add more customizations */}
        <div className="cursor-pointer" onClick={handleBadgeClick}>
          <CheckboxButton
            className="max-w-fit"
            checked={false}
            setValue={() => {}} // Disabled toggle
            label="+"
            isCheckedClassName="border-green-600/40 bg-green-500/10 hover:bg-green-700/10"
            icon={<Settings className="icon-md" />}
          />
        </div>
      </div>
      
      <PersonaDialog
        isOpen={dialogOpen}
        setIsOpen={setDialogOpen}
        conversationId={conversationId}
      />
    </>
  );
}

export default memo(Persona); 