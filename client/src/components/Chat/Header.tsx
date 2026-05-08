import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ContextType } from '~/common';
import Settings from '~/components/Nav/Settings';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { asset } from '~/utils/assetPath';
import ModelSelector from '~/components/Chat/Menus/Endpoints/ModelSelector';
import { HeaderNewChat } from './Menus';

export default function Header() {
  const { navVisible } = useOutletContext<ContextType>();
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="bg-fig-Surface-standard text-fig-Text-heading sticky top-0 z-10 flex h-14 w-full items-center justify-between p-2 font-semibold">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <AnimatePresence initial={false}>
            {!navVisible && (
              <motion.div
                className={`flex items-center gap-2`}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                key="header-buttons"
              >
                <HeaderNewChat />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Center: FIA Logo and Text */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-sm">
            <img src={asset('FIA.svg')} alt="FIA" className="h-full w-full object-contain" />
          </div>
          <div className="fy-typography-title">FIA - FYERS Intelligent Assistant</div>
        </div>

        {/* Right: model row + Settings inside same scale-75 block (gear sits beside model button) */}
        <div className="mx-1 flex items-center">
          <div className="flex flex-row items-center gap-2 scale-75 origin-right">
            <div className="min-w-0 max-w-md flex-1">
              <ModelSelector startupConfig={startupConfig} />
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="my-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface-secondary text-text-primary hover:bg-surface-tertiary"
              aria-label={localize('com_nav_settings')}
            >
              <img
                src="/assets/settings.svg"
                alt=""
                className="h-5 w-5 dark:brightness-0 dark:invert"
              />
            </button>
          </div>
        </div>
      </div>
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </div>
  );
}
