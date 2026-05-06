import { useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import {
  VerifyEmail,
  Registration,
  ResetPassword,
  ApiErrorWatcher,
  TwoFactorScreen,
  RequestPasswordReset,
} from '~/components/Auth';
import { MarketplaceProvider } from '~/components/Agents/MarketplaceContext';
import AgentMarketplace from '~/components/Agents/Marketplace';
import { OAuthSuccess, OAuthError } from '~/components/OAuth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import RouteErrorBoundary from './RouteErrorBoundary';
import StartupLayout from './Layouts/Startup';
import LoginLayout from './Layouts/Login';
import dashboardRoutes from './Dashboard';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import Search from './Search';
import Root from './Root';
import AdminRoute from './AdminRoute';
import TemplatesRoute from './TemplatesRoute';
import ResourcesRoute from './ResourcesRoute';
import FileViewRoute from './FileViewRoute';
import ThemeFromQueryParam from '~/components/System/ThemeFromQueryParam';
import WebViewNavigationListener from '~/components/System/WebViewNavigationListener';

// Component to handle static file routes (returns null to prevent React Router from handling them)
const StaticFileRoute = () => {
  // This route is handled by the backend, not React Router
  // Return null to prevent React Router from trying to render anything
  return null;
};

const EMBED_RELOAD_PENDING_KEY = 'research_embed_reload_pending';
const EMBED_RELOAD_PENDING_AT_KEY = `${EMBED_RELOAD_PENDING_KEY}_at`;

function getResearchAppRootHref(): string {
  const base = document.querySelector('base')?.getAttribute('href') || '/research/';
  const url = new URL(base, window.location.origin);
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return `${url.origin}${path}`;
}

function isNavigationReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

function clearEmbedReloadSessionKeys(): void {
  sessionStorage.removeItem(EMBED_RELOAD_PENDING_KEY);
  sessionStorage.removeItem(EMBED_RELOAD_PENDING_AT_KEY);
}

/**
 * GET /research/auth/embed is handled by insti-proxy (cookies + redirect), not the SPA.
 * If the iframe revisits this URL via client-side navigation/history, React Router would 404.
 * One full `location.reload()` gives the proxy another chance to serve embedHandler.
 * If nginx always serves index.html, reloading the same URL forever loops — after our reload,
 * if `performance.navigation.type === 'reload'`, bail to app root (still SPA).
 * React Strict Mode runs effects twice on first paint; while pending and the navigation entry
 * is still `navigate`, ignore duplicate effects for a short window. Drop stale pending flags
 * so client-side revisits to this route do not no-op forever.
 */
const EmbedAuthReload = () => {
  useEffect(() => {
    try {
      const now = Date.now();
      const pending = sessionStorage.getItem(EMBED_RELOAD_PENDING_KEY) === '1';
      const pendingAt = parseInt(sessionStorage.getItem(EMBED_RELOAD_PENDING_AT_KEY) || '0', 10);

      if (pending && isNavigationReload()) {
        clearEmbedReloadSessionKeys();
        window.location.replace(getResearchAppRootHref());
        return;
      }

      if (pending && !isNavigationReload()) {
        if (now - pendingAt < 450) {
          return;
        }
        clearEmbedReloadSessionKeys();
      }

      sessionStorage.setItem(EMBED_RELOAD_PENDING_KEY, '1');
      sessionStorage.setItem(EMBED_RELOAD_PENDING_AT_KEY, String(now));
      window.location.reload();
    } catch {
      clearEmbedReloadSessionKeys();
      window.location.replace(getResearchAppRootHref());
    }
  }, []);
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-gray-600 dark:text-gray-400">
      Signing you in…
    </div>
  );
};

const AuthLayout = () => (
  <Outlet />
);

// Wrap all routes with AuthContextProvider and ApiErrorWatcher
const RootLayout = () => (
  <AuthContextProvider>
    <ThemeFromQueryParam />
    <WebViewNavigationListener />
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

const baseEl = document.querySelector('base');
const baseHref = baseEl?.getAttribute('href') || '/';

export const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
    // Static file route - must be first to prevent React Router from trying to handle backend routes
    {
      path: 'static/*',
      element: <StaticFileRoute />,
    },
    {
      path: 'auth/embed',
      element: <EmbedAuthReload />,
    },
    {
      path: 'share/:shareId',
      element: <ShareRoute />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'oauth',
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'success',
          element: <OAuthSuccess />,
        },
        {
          path: 'error',
          element: <OAuthError />,
        },
      ],
    },
    {
      path: '/',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'register',
          element: <Registration />,
        },
        {
          path: 'forgot-password',
          element: <RequestPasswordReset />,
        },
        {
          path: 'reset-password',
          element: <ResetPassword />,
        },
      ],
    },
    {
      path: 'verify',
      element: <VerifyEmail />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      element: <AuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <LoginLayout />,
          children: [
            {
              path: 'login/2fa',
              element: <TwoFactorScreen />,
            },
          ],
        },
        dashboardRoutes,
        {
          path: '/',
          element: <Root />,
          children: [
            {
              index: true,
              element: <Navigate to="/c/new" replace={true} />,
            },
            {
              path: 'c/:conversationId?',
              element: <ChatRoute />,
            },
            {
              path: 'search',
              element: <Search />,
            },
            {
              path: 'agents',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'agents/:category',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'admin',
              element: <AdminRoute />,
            },
            {
              path: 'resources',
              element: <ResourcesRoute />,
            },
            {
              path: 'templates',
              element: <TemplatesRoute />,
            },
          ],
        },
      ],
    },
        // File view route - now wrapped by AuthContextProvider but outside AuthLayout for direct file viewing
    {
      path: 'files/:fileId',
      element: <FileViewRoute />,
      errorElement: <RouteErrorBoundary />,
        },
      ],
    },
  ],
  { basename: baseHref },
);
