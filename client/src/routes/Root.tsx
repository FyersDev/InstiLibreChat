import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { ContextType } from '~/common';
import { Banner } from '~/components/Banners';
import { MobileNav, Nav, SidebarEdgeTabs } from '~/components/Nav';
import TopNavBar from '~/components/Nav/TopNavBar';
import { TermsAndConditionsModal } from '~/components/ui';
import { useGetStartupConfig, useHealthCheck, useUserTermsQuery } from '~/data-provider';
import {
  useAgentsMap,
  useAssistantsMap,
  useAuthContext,
  useFileMap,
  useSearchEnabled,
} from '~/hooks';
import {
  AgentsMapContext,
  AssistantsMapContext,
  FileMapContext,
  PromptGroupsProvider,
  SetConvoProvider,
} from '~/Providers';

export default function Root() {
  const location = useLocation();
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : false;
  });

  const { isAuthenticated, logout } = useAuthContext();

  const showTopNavBar = useMemo(() => {
    return new URLSearchParams(location.search).get('showtopnav') === '1';
  }, [location.search]);

  // Only show chat history sidebar on chat routes (FIA research), not on admin/templates/screener/resources
  const shouldShowNav =
    !location.pathname.startsWith('/admin') &&
    !location.pathname.startsWith('/templates') &&
    !location.pathname.startsWith('/screener') &&
    !location.pathname.startsWith('/resources');

  // Global health check - runs once per authenticated session
  useHealthCheck(isAuthenticated);

  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const agentsMap = useAgentsMap({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });

  const { data: config } = useGetStartupConfig();
  const { data: termsData } = useUserTermsQuery({
    enabled: isAuthenticated && config?.interface?.termsOfService?.modalAcceptance === true,
  });

  useSearchEnabled(isAuthenticated);

  useEffect(() => {
    if (termsData) {
      setShowTerms(!termsData.termsAccepted);
    }
  }, [termsData]);

  const handleAcceptTerms = () => {
    setShowTerms(false);
  };

  const handleDeclineTerms = () => {
    setShowTerms(false);
    logout('/login?redirect=false');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SetConvoProvider>
      <FileMapContext.Provider value={fileMap}>
        <AssistantsMapContext.Provider value={assistantsMap}>
          <AgentsMapContext.Provider value={agentsMap}>
            <PromptGroupsProvider>
              <Banner onHeightChange={setBannerHeight} />
              <div
                className="flex flex-col bg-[#f6f8ff] dark:bg-[#2a2a2a]"
                style={{ height: `calc(100dvh - ${bannerHeight}px)` }}
              >
                {showTopNavBar && <TopNavBar />}
                {/* Shell padding L/T/R/B = 4/0/4/4 px; column gap 4px (FYERS Design) */}
                <div className="flex flex-1 overflow-hidden p-[0px_4px_4px_4px]">
                  <div className="relative z-0 flex h-full w-full gap-[4px] overflow-hidden">
                    {shouldShowNav && <Nav navVisible={navVisible} setNavVisible={setNavVisible} />}
                    <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
                      {shouldShowNav && (
                        <SidebarEdgeTabs navVisible={navVisible} setNavVisible={setNavVisible} />
                      )}
                      {shouldShowNav && (
                        <MobileNav navVisible={navVisible} setNavVisible={setNavVisible} />
                      )}
                      <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
                    </div>
                  </div>
                </div>
              </div>
            </PromptGroupsProvider>
          </AgentsMapContext.Provider>
          {config?.interface?.termsOfService?.modalAcceptance === true && (
            <TermsAndConditionsModal
              open={showTerms}
              onOpenChange={setShowTerms}
              onAccept={handleAcceptTerms}
              onDecline={handleDeclineTerms}
              title={config.interface.termsOfService.modalTitle}
              modalContent={config.interface.termsOfService.modalContent}
            />
          )}
        </AssistantsMapContext.Provider>
      </FileMapContext.Provider>
    </SetConvoProvider>
  );
}
