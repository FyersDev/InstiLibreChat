import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Settings } from 'lucide-react';
import PersonaDialog from './PersonaDialog';
import { useLocalize } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

interface CustomizeSubMenuProps {
  conversationId?: string | null;
  onOpenDialog?: () => void;
}

const CustomizeSubMenu = React.forwardRef<HTMLDivElement, CustomizeSubMenuProps>(
  ({ conversationId, onOpenDialog: closeParentDropdown, ...props }, ref) => {
    const localize = useLocalize();
    const { persona } = useBadgeRowContext();
    const { debouncedChange } = persona;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleOpenDialog = () => {
      setDialogOpen(true);
      // Close the parent dropdown when opening the dialog
      closeParentDropdown?.();
    };

    const handleDialogChange = useCallback((isOpen: boolean) => {
      setDialogOpen(isOpen);
      if (!isOpen) {
        setRefreshKey((prev) => prev + 1);
        // Also dispatch the event for consistency
        window.dispatchEvent(new CustomEvent('customizeChanged'));
      }
    }, []);

    // Get current customization state - make it reactive
    const customizationState = useMemo(() => {
      const key = conversationId || 'new';
      const personaData = localStorage.getItem(`persona_data_${key}`);
      const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
      
      let hasPersona = false;
      let hasTemplate = false;
      let hasDocuments = false;
      let personaName = '';
      let templateName = '';
      let docCount = 0;
      
      // Check for persona
      if (personaData && personaData.trim()) {
        hasPersona = true;
        // Try to find persona name
        const saved = localStorage.getItem('saved_personas');
        const parsedSaved = saved ? JSON.parse(saved) : [];
        const defaultPersonas = [
          { name: 'FIA (default)', detailedPrompt: 'You are a helpful AI assistant that provides balanced and informative responses. Focus on being accurate, clear, and helpful in all interactions.' },
          { name: 'Risk manager', detailedPrompt: 'You are a seasoned risk manager with 15+ years of experience in enterprise risk management.' },
          { name: 'Investment advisor', detailedPrompt: 'You are an experienced investment advisor with deep expertise in portfolio management, asset allocation, and market analysis.' },
          { name: 'Technical analyst', detailedPrompt: 'You are a skilled technical analyst with expertise in chart pattern recognition, technical indicators, and quantitative trading strategies.' },
          { name: 'ESG specialist', detailedPrompt: 'You are an ESG specialist with comprehensive knowledge of Environmental, Social, and Governance factors in investment decisions.' }
        ];
        const allPersonas = [...parsedSaved, ...defaultPersonas];
        const current = allPersonas.find(p => p.detailedPrompt === personaData);
        personaName = current ? current.name : 'Custom (default)';
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
            hasDocuments = true;
            docCount = documentData.documents.length;
          }
        } catch (error) {
          console.error('Error parsing document data:', error);
        }
      }
      
      return {
        hasPersona,
        hasTemplate,
        hasDocuments,
        personaName,
        templateName,
        docCount
      };
    }, [conversationId, refreshKey]);

    const hasAnyCustomization = customizationState.hasPersona || customizationState.hasTemplate || customizationState.hasDocuments;

    // Ensure persona toggle state is updated based on actual customizations
    useEffect(() => {
      if (hasAnyCustomization && !persona.toggleState) {
        debouncedChange({ value: true });
      } else if (!hasAnyCustomization && persona.toggleState) {
        debouncedChange({ value: false });
      }
    }, [hasAnyCustomization, persona.toggleState, debouncedChange]);

    return (
      <div 
        ref={ref} 
        {...props}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleOpenDialog();
        }}
        className="flex w-full cursor-pointer items-center gap-2"
      >
        <Settings className="icon-md" />
        <span>Customize</span>

        <PersonaDialog
          isOpen={dialogOpen}
          setIsOpen={handleDialogChange}
          conversationId={conversationId}
        />
      </div>
    );
  },
);

CustomizeSubMenu.displayName = 'CustomizeSubMenu';

export default React.memo(CustomizeSubMenu);
