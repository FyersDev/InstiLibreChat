import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X, ChevronDown, FileText } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { DocumentSelection } from '~/components/Documents';
import type { DocumentListItem } from '~/data-provider/document-service';
import { cn } from '~/utils';

interface PersonaDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  conversationId?: string | null;
}

interface SavedPersona {
  name: string;
  description: string;
  detailedPrompt: string;
}

interface SavedTemplate {
  name: string;
  description: string;
  detailedPrompt: string;
}

function PersonaDialog({ isOpen, setIsOpen, conversationId }: PersonaDialogProps) {
  const localize = useLocalize();
  const key = conversationId || 'new';
  const [tempPersona, setTempPersona] = useState('');
  const [tempDescription, setTempDescription] = useState('');
  const [tempDetailedPrompt, setTempDetailedPrompt] = useState('');
  const [personaName, setPersonaName] = useState('');
  const [savedPersonas, setSavedPersonas] = useState<SavedPersona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPersona, setEditingPersona] = useState<SavedPersona | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentListItem[]>([]);
  const [showDocumentSelection, setShowDocumentSelection] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SavedTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [tempTemplateDescription, setTempTemplateDescription] = useState('');
  const [tempTemplatePrompt, setTempTemplatePrompt] = useState('');

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

  // Default templates
  const defaultTemplates: SavedTemplate[] = [
    {
      name: 'Quarterly report',
      description: 'Standard template for quarterly financial reports',
      detailedPrompt: 'Generate a comprehensive quarterly financial report including: Executive Summary, Financial Highlights, Revenue Analysis, Expense Breakdown, Key Performance Indicators, Market Outlook, Risk Factors, and Management Commentary. Use clear formatting with tables and charts where appropriate.'
    },
    {
      name: 'Annual report',
      description: 'Comprehensive template for annual reports',
      detailedPrompt: 'Create a detailed annual report with: Letter to Shareholders, Business Overview, Financial Performance Review, Market Analysis, Strategic Initiatives, Risk Management, Corporate Governance, and Forward-Looking Statements. Include year-over-year comparisons and detailed financial metrics.'
    },
    {
      name: 'Risk assessment',
      description: 'Template for risk analysis and assessment',
      detailedPrompt: 'Conduct a thorough risk assessment including: Risk Identification, Impact Analysis, Probability Assessment, Risk Matrix, Mitigation Strategies, Contingency Plans, and Monitoring Framework. Categorize risks by type (operational, financial, strategic, compliance) and provide actionable recommendations.'
    },
    {
      name: 'Technical analysis',
      description: 'Template for technical market analysis',
      detailedPrompt: 'Perform technical analysis covering: Price Action Analysis, Chart Patterns, Technical Indicators (RSI, MACD, Moving Averages), Support and Resistance Levels, Volume Analysis, Market Trends, and Trading Signals. Include visual representations and clear entry/exit points.'
    },
    {
      name: 'Market summary',
      description: 'Template for market overview and summary',
      detailedPrompt: 'Provide a comprehensive market summary including: Market Overview, Key Developments, Sector Performance, Economic Indicators, Major News Impact, Trading Volume Analysis, and Market Outlook. Focus on actionable insights and market implications.'
    }
  ];

  // Initialize personas and templates once
  useEffect(() => {
    const saved = localStorage.getItem('saved_personas');
    const parsedSaved = saved ? JSON.parse(saved) : [];
    
    // Migrate old personas to new format
    const migratedSaved = parsedSaved.map((persona: any) => {
      if (!persona.detailedPrompt) {
        return {
          ...persona,
          detailedPrompt: persona.description || persona.name || 'You are a helpful assistant.'
        };
      }
      return persona;
    });
    
    // Save migrated personas back to localStorage if migration occurred
    if (migratedSaved.some((p: any, i: number) => p !== parsedSaved[i])) {
      localStorage.setItem('saved_personas', JSON.stringify(migratedSaved));
    }
    
    const allPersonas = [...defaultPersonas, ...migratedSaved];
    setSavedPersonas(allPersonas);

    // Initialize templates
    const savedTemplatesStr = localStorage.getItem('saved_templates');
    const parsedTemplates = savedTemplatesStr ? JSON.parse(savedTemplatesStr) : [];
    const allTemplates = [...defaultTemplates, ...parsedTemplates];
    setSavedTemplates(allTemplates);
    
    setIsInitialized(true);
  }, []); // Only run once on mount

  // Load current persona when dialog opens
  useEffect(() => {
    if (isOpen && isInitialized) {
      // Load current persona for this conversation
      const currentPersona = localStorage.getItem(`persona_data_${key}`) || '';
      setTempDetailedPrompt(currentPersona);

      // Load document data
      const documentDataStr = localStorage.getItem(`persona_documents_${key}`);
      if (documentDataStr) {
        try {
          const documentData = JSON.parse(documentDataStr);
          
          // Set selected documents if available
          setSelectedDocuments(documentData.documents || []);
          
          // Set template if available, otherwise leave empty
          const templateName = documentData.template || '';
          setSelectedTemplate(templateName);
          
          // Find the template object for the selected template
          if (templateName) {
            const templateObj = savedTemplates.find(t => t.name === templateName);
            if (templateObj) {
              setTempTemplateDescription(templateObj.description);
              setTempTemplatePrompt(templateObj.detailedPrompt);
            }
          } else {
            // Clear template data if no template is selected
            setTempTemplateDescription('');
            setTempTemplatePrompt('');
          }
        } catch (error) {
          console.error('Error parsing document data:', error);
        }
      } else {
        // No saved document data, initialize with empty values
        setSelectedDocuments([]);
        setSelectedTemplate('');
        setTempTemplateDescription('');
        setTempTemplatePrompt('');
      }

      // Find which persona is currently selected
      const current = savedPersonas.find(p => p.detailedPrompt === currentPersona);
      if (current) {
        setSelectedPersona(current.name);
        setTempPersona(current.name);
        setTempDescription(current.description);
      } else {
        setSelectedPersona('');
        setTempPersona('');
        setTempDescription('');
      }
    } else if (!isOpen) {
      // Reset form when dialog closes
      setShowAddForm(false);
      setPersonaName('');
      setTempPersona('');
      setTempDescription('');
      setTempDetailedPrompt('');
      setEditingPersona(null);
      setIsDropdownOpen(false);
      setShowDocumentSelection(false);
      setIsTemplateDropdownOpen(false);
      setShowCreateTemplate(false);
      setEditingTemplate(null);
      setTemplateName('');
      setTempTemplateDescription('');
      setTempTemplatePrompt('');
    }
  }, [isOpen, key, savedPersonas, savedTemplates, isInitialized]);

  const handleDocumentSelectionConfirm = useCallback((documents: DocumentListItem[]) => {
    setSelectedDocuments(documents);
    setShowDocumentSelection(false);
  }, []);

  const handleTemplateSelect = useCallback((templateName: string) => {
    if (!templateName) {
      setSelectedTemplate('');
      setTempTemplateDescription('');
      setTempTemplatePrompt('');
      return;
    }

    const template = savedTemplates.find(t => t.name === templateName);
    if (template) {
      setSelectedTemplate(templateName);
      setTempTemplateDescription(template.description);
      setTempTemplatePrompt(template.detailedPrompt);
    }
  }, [savedTemplates]);

  const handleCreateTemplate = () => {
    if (templateName.trim() && tempTemplateDescription.trim() && tempTemplatePrompt.trim()) {
      const newTemplate: SavedTemplate = {
        name: templateName.trim(),
        description: tempTemplateDescription.trim(),
        detailedPrompt: tempTemplatePrompt.trim(),
      };

      // Get existing custom templates (excluding defaults)
      const savedTemplatesStr = localStorage.getItem('saved_templates');
      const parsedTemplates = savedTemplatesStr ? JSON.parse(savedTemplatesStr) : [];
      
      // Add new template
      const updatedTemplates = [...parsedTemplates, newTemplate];
      localStorage.setItem('saved_templates', JSON.stringify(updatedTemplates));
      
      // Update state
      const allTemplates = [...defaultTemplates, ...updatedTemplates];
      setSavedTemplates(allTemplates);
      setSelectedTemplate(newTemplate.name);
      setTempTemplateDescription(newTemplate.description);
      setTempTemplatePrompt(newTemplate.detailedPrompt);
      setTemplateName('');
      setShowCreateTemplate(false);
    }
  };

  const handleEditTemplate = (template: SavedTemplate) => {
    setEditingTemplate(template);
  };

  const handleUpdateTemplate = () => {
    if (editingTemplate) {
      // Update the template
      const savedTemplatesStr = localStorage.getItem('saved_templates');
      const parsedTemplates = savedTemplatesStr ? JSON.parse(savedTemplatesStr) : [];
      const updatedTemplates = parsedTemplates.map((t: SavedTemplate) => 
        t.name === editingTemplate.name ? editingTemplate : t
      );
      localStorage.setItem('saved_templates', JSON.stringify(updatedTemplates));
      
      // Update state
      const allTemplates = [...defaultTemplates, ...updatedTemplates];
      setSavedTemplates(allTemplates);
      
      // Update current selection if it was the edited one
      if (selectedTemplate === editingTemplate.name) {
        setTempTemplateDescription(editingTemplate.description);
        setTempTemplatePrompt(editingTemplate.detailedPrompt);
      }
      
      setEditingTemplate(null);
    }
  };

  const handleSave = () => {
    // Store the persona data only if a persona is selected
    if (selectedPersona || tempDetailedPrompt.trim()) {
      localStorage.setItem(`persona_data_${key}`, tempDetailedPrompt);
    } else {
      localStorage.removeItem(`persona_data_${key}`);
    }
    
    // Store selected documents and template separately
    const documentData = {
      documents: selectedDocuments,
      template: selectedTemplate || ''
    };
    
    // Only store document data if documents are selected or template is selected
    if (selectedDocuments.length > 0 || selectedTemplate) {
      localStorage.setItem(`persona_documents_${key}`, JSON.stringify(documentData));
    } else {
      localStorage.removeItem(`persona_documents_${key}`);
    }
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('customizeChanged'));
    
    setIsOpen(false);
  };

  const handleClear = () => {
    // Clear persona data
    setTempPersona('');
    setTempDescription('');
    setTempDetailedPrompt('');
    setSelectedPersona('');
    
    // Clear document selection
    setSelectedDocuments([]);
    
    // Clear template selection
    setSelectedTemplate('');
    setTempTemplateDescription('');
    setTempTemplatePrompt('');
    
    // Remove from localStorage
    localStorage.removeItem(`persona_data_${key}`);
    localStorage.removeItem(`persona_documents_${key}`);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('customizeChanged'));
  };

  const handlePersonaSelect = useCallback((personaName: string) => {
    if (!personaName) {
      setTempPersona('');
      setTempDescription('');
      setTempDetailedPrompt('');
      setSelectedPersona('');
      return;
    }

    const persona = savedPersonas.find(p => p.name === personaName);
    if (persona) {
      setTempPersona(persona.name);
      setTempDescription(persona.description);
      setTempDetailedPrompt(persona.detailedPrompt);
      setSelectedPersona(personaName);
    }
  }, [savedPersonas]);

  const handleAddPersona = () => {
    if (personaName.trim() && tempDescription.trim() && tempDetailedPrompt.trim()) {
      const newPersona: SavedPersona = {
        name: personaName.trim(),
        description: tempDescription.trim(),
        detailedPrompt: tempDetailedPrompt.trim(),
      };

      // Get existing custom personas (excluding defaults)
      const saved = localStorage.getItem('saved_personas');
      const parsedSaved = saved ? JSON.parse(saved) : [];
      
      // Add new persona
      const updatedSaved = [...parsedSaved, newPersona];
      localStorage.setItem('saved_personas', JSON.stringify(updatedSaved));
      
      // Update state
      const allPersonas = [...defaultPersonas, ...updatedSaved];
      setSavedPersonas(allPersonas);
      setSelectedPersona(newPersona.name);
      setTempPersona(newPersona.name);
      setTempDescription(newPersona.description);
      setTempDetailedPrompt(newPersona.detailedPrompt);
      setPersonaName('');
      setShowAddForm(false);
    }
  };

  // Don't render until initialized to prevent flashing
  if (!isInitialized) {
    return null;
  }

  return (
    <>
    {/* Main Persona Dialog */}
    <Dialog open={isOpen && !editingPersona && !showCreateTemplate && !editingTemplate && !showDocumentSelection} onClose={setIsOpen} className="relative z-50">
      <div className="fixed inset-0 bg-black/25" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="max-w-xs w-full bg-white rounded-lg shadow-xl p-0 max-h-[80vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-200">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Customize
            </DialogTitle>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="p-4 space-y-6">
                    {/* Template Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-gray-900">Template</label>
                        <span className="text-xs text-gray-500">Optional</span>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                          className={cn(
                            "w-full flex items-center justify-between p-3 border rounded-lg text-left transition-colors",
                            selectedTemplate 
                              ? "bg-blue-50 border-blue-200 text-blue-900" 
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
                          )}
                        >
                          <span className="text-sm">
                            {selectedTemplate || 'Select a template...'}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isTemplateDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isTemplateDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                            <button
                              onClick={() => {
                                handleTemplateSelect('');
                                setIsTemplateDropdownOpen(false);
                              }}
                              className="w-full p-3 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors border-b border-gray-100"
                            >
                              No template
                            </button>
                            {savedTemplates.map((template) => (
                              <button
                                key={template.name}
                                onClick={() => {
                                  handleTemplateSelect(template.name);
                                  setIsTemplateDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full p-3 text-left text-sm transition-colors border-b border-gray-100 last:border-b-0",
                                  selectedTemplate === template.name
                                    ? "bg-blue-50 text-blue-900 font-medium"
                                    : "text-gray-900 hover:bg-gray-50"
                                )}
                              >
                                <div className="font-medium">{template.name}</div>
                                <div className="text-xs text-gray-500 mt-1">{template.description}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add Template Button */}
                      <button
                        onClick={() => setShowCreateTemplate(true)}
                        className="w-full p-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
                      >
                        + Create new template
                      </button>
                    </div>

                    {/* Selected Template Display */}
                    {selectedTemplate && (
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 text-sm mb-1">{selectedTemplate}</h4>
                            <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{tempTemplateDescription}</p>
                          </div>
                          {!defaultTemplates.some(t => t.name === selectedTemplate) && (
                            <button
                              onClick={() => {
                                const template = savedTemplates.find(t => t.name === selectedTemplate);
                                if (template) {
                                  handleEditTemplate(template);
                                }
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700 transition-colors flex-shrink-0"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Documents Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-gray-900">Documents</label>
                        <span className="text-xs text-gray-500">Optional</span>
                      </div>
                      <button
                        onClick={() => setShowDocumentSelection(true)}
                        className={cn(
                          "w-full p-3 border rounded-lg text-left transition-colors flex items-center justify-between",
                          selectedDocuments.length > 0
                            ? "bg-purple-50 border-purple-200 text-purple-900"
                            : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
                        )}
                      >
                        <span className="text-sm">
                          {selectedDocuments.length > 0 
                            ? `${selectedDocuments.length} document${selectedDocuments.length !== 1 ? 's' : ''} selected`
                            : 'Select documents...'
                          }
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      </button>

                      {/* Selected Documents Display */}
                      {selectedDocuments.length > 0 && (
                        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-900">
                              Selected Documents
                            </span>
                          </div>
                          <div className="space-y-1">
                            {selectedDocuments.slice(0, 3).map((doc) => (
                              <div key={doc.filename} className="text-xs text-purple-700 truncate">
                                • {doc.filename}
                              </div>
                            ))}
                            {selectedDocuments.length > 3 && (
                              <div className="text-xs text-purple-600 font-medium">
                                +{selectedDocuments.length - 3} more documents
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Persona Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-gray-900">Persona</label>
                        <span className="text-xs text-gray-500">Optional</span>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className={cn(
                            "w-full flex items-center justify-between p-3 border rounded-lg text-left transition-colors",
                            selectedPersona
                              ? "bg-green-50 border-green-200 text-green-900"
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
                          )}
                        >
                          <span className="text-sm">
                            {selectedPersona || 'Select a persona...'}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                            <button
                              onClick={() => {
                                handlePersonaSelect('');
                                setIsDropdownOpen(false);
                              }}
                              className="w-full p-3 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors border-b border-gray-100"
                            >
                              No persona
                            </button>
                            {savedPersonas.map((persona) => (
                              <button
                                key={persona.name}
                                onClick={() => {
                                  handlePersonaSelect(persona.name);
                                  setIsDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full p-3 text-left text-sm transition-colors border-b border-gray-100 last:border-b-0",
                                  selectedPersona === persona.name
                                    ? "bg-green-50 text-green-900 font-medium"
                                    : "text-gray-900 hover:bg-gray-50"
                                )}
                              >
                                <div className="font-medium">{persona.name}</div>
                                <div className="text-xs text-gray-500 mt-1">{persona.description}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Create New Persona Button */}
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="w-full p-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                      >
                        + Create new persona
                      </button>
                    </div>

                    {/* Selected Persona Display */}
                    {selectedPersona && (
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 text-sm mb-1">{selectedPersona}</h4>
                            <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{tempDescription}</p>
                          </div>
                          {!defaultPersonas.some(p => p.name === selectedPersona) && (
                            <button
                              onClick={() => {
                                const persona = savedPersonas.find(p => p.name === selectedPersona);
                                if (persona) {
                                  setEditingPersona(persona);
                                }
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700 transition-colors flex-shrink-0"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => setIsOpen(false)}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleClear}
                        className="px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                      >
                        Apply Changes
                      </button>
                    </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Create Persona Dialog */}
      <Dialog open={showAddForm} onClose={setShowAddForm} className="relative z-50">
        <div className="fixed inset-0 bg-black/25" />
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="max-w-md w-full bg-white rounded-lg shadow-xl p-0">
            <div className="flex items-center justify-between p-6 pb-4">
              <DialogTitle className="text-lg font-semibold text-gray-900">
                Create persona
              </DialogTitle>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Screener name
                </label>
                <input
                  type="text"
                  value={personaName}
                  onChange={(e) => setPersonaName(e.target.value)}
                  placeholder="Enter persona name"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Description
                </label>
                <textarea
                  value={tempDescription}
                  onChange={(e) => setTempDescription(e.target.value)}
                  placeholder="Describe your persona"
                  rows={3}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Detailed prompt
                </label>
                <textarea
                  value={tempDetailedPrompt}
                  onChange={(e) => setTempDetailedPrompt(e.target.value)}
                  placeholder="Detailed instructions for this persona"
                  rows={4}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleAddPersona}
                  disabled={!personaName.trim() || !tempDescription.trim() || !tempDetailedPrompt.trim()}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Edit Persona Dialog */}
      <Dialog open={!!editingPersona} onClose={() => setEditingPersona(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/25" />
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="max-w-md w-full bg-white rounded-lg shadow-xl p-0">
            <div className="flex items-center justify-between p-6 pb-4">
              <DialogTitle className="text-lg font-semibold text-gray-900">
                Edit persona
              </DialogTitle>
              <button
                onClick={() => setEditingPersona(null)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Screener name
                </label>
                <input
                  type="text"
                  value={editingPersona?.name || ''}
                  onChange={(e) => setEditingPersona(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Description
                </label>
                <textarea
                  value={editingPersona?.description || ''}
                  onChange={(e) => setEditingPersona(prev => prev ? { ...prev, description: e.target.value } : null)}
                  rows={3}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none resize-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Detailed prompt
                </label>
                <textarea
                  value={editingPersona?.detailedPrompt || ''}
                  onChange={(e) => setEditingPersona(prev => prev ? { ...prev, detailedPrompt: e.target.value } : null)}
                  rows={4}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none resize-none transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setEditingPersona(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    if (editingPersona) {
                      // Update the persona
                      const saved = localStorage.getItem('saved_personas');
                      const parsedSaved = saved ? JSON.parse(saved) : [];
                      const updatedSaved = parsedSaved.map((p: SavedPersona) => 
                        p.name === selectedPersona ? editingPersona : p
                      );
                      localStorage.setItem('saved_personas', JSON.stringify(updatedSaved));
                      
                      // Update state
                      const allPersonas = [...defaultPersonas, ...updatedSaved];
                      setSavedPersonas(allPersonas);
                      
                      // Update current selection if it was the edited one
                      if (selectedPersona === editingPersona.name) {
                        setTempPersona(editingPersona.name);
                        setTempDescription(editingPersona.description);
                        setTempDetailedPrompt(editingPersona.detailedPrompt);
                      }
                      
                      setEditingPersona(null);
                    }
                  }}
                  disabled={!editingPersona?.name.trim() || !editingPersona?.description.trim() || !editingPersona?.detailedPrompt.trim()}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Confirm
                </button>
              </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>

    {/* Create Template Dialog */}
    <Dialog open={showCreateTemplate} onClose={setShowCreateTemplate} className="relative z-50">
      <div className="fixed inset-0 bg-black/25" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="max-w-md w-full bg-white rounded-lg shadow-xl p-0">
          <div className="flex items-center justify-between p-6 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Create template
            </DialogTitle>
            <button
              onClick={() => setShowCreateTemplate(false)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Template name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Enter persona name"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Short description
              </label>
              <textarea
                value={tempTemplateDescription}
                onChange={(e) => setTempTemplateDescription(e.target.value)}
                placeholder="Describe your template"
                rows={3}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Detailed prompt
              </label>
              <textarea
                value={tempTemplatePrompt}
                onChange={(e) => setTempTemplatePrompt(e.target.value)}
                placeholder="Detailed instructions for this template"
                rows={4}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none transition-colors"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setShowCreateTemplate(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!templateName.trim() || !tempTemplateDescription.trim() || !tempTemplatePrompt.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>

    {/* Edit Template Dialog */}
    <Dialog open={!!editingTemplate} onClose={() => setEditingTemplate(null)} className="relative z-50">
      <div className="fixed inset-0 bg-black/25" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="max-w-md w-full bg-white rounded-lg shadow-xl p-0">
          <div className="flex items-center justify-between p-6 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Edit template
            </DialogTitle>
            <button
              onClick={() => setEditingTemplate(null)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Template name
              </label>
              <input
                type="text"
                value={editingTemplate?.name || ''}
                onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, name: e.target.value } : null)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Short description
              </label>
              <textarea
                value={editingTemplate?.description || ''}
                onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, description: e.target.value } : null)}
                rows={3}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none resize-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Detailed prompt
              </label>
              <textarea
                value={editingTemplate?.detailedPrompt || ''}
                onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, detailedPrompt: e.target.value } : null)}
                rows={4}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none resize-none transition-colors"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setEditingTemplate(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={handleUpdateTemplate}
                disabled={!editingTemplate?.name.trim() || !editingTemplate?.description.trim() || !editingTemplate?.detailedPrompt.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>

    {/* Document Selection Modal */}
    <DocumentSelection
      isOpen={showDocumentSelection}
      onClose={() => setShowDocumentSelection(false)}
      onConfirm={handleDocumentSelectionConfirm}
      selectedDocuments={selectedDocuments}
    />
  </>
);
}

export default PersonaDialog; 