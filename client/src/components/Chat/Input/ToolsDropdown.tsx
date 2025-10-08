import React, { useState, useCallback } from 'react';
import { Settings2 } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import PersonaDialog from './PersonaDialog';
import { cn } from '~/utils';

interface ToolsDropdownProps {
  disabled?: boolean;
}

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [dialogOpen, setDialogOpen] = useState(false);
  const { conversationId } = useBadgeRowContext();

  const handleDialogChange = useCallback((isOpen: boolean) => {
    setDialogOpen(isOpen);
    if (!isOpen) {
      // Dispatch event for consistency
      window.dispatchEvent(new CustomEvent('customizeChanged'));
    }
  }, []);

  const handleClick = () => {
    if (isDisabled) return;
    setDialogOpen(true);
  };

  return (
    <>
      <TooltipAnchor
        render={
          <button
            disabled={isDisabled}
            onClick={handleClick}
            id="tools-dropdown-button"
            aria-label="Customize Options"
            className={cn(
              'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
              isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
            )}
          >
            <div className="flex w-full items-center justify-center gap-2">
              <Settings2 className="icon-md" />
            </div>
          </button>
        }
        id="tools-dropdown-button"
        description={localize('com_ui_tools')}
        disabled={isDisabled}
      />
      
      <PersonaDialog
        isOpen={dialogOpen}
        setIsOpen={handleDialogChange}
        conversationId={conversationId}
      />
    </>
  );
};

export default React.memo(ToolsDropdown);
