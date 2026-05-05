/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import useAuthRedirect from '../useAuthRedirect';
import { useAuthContext } from '~/hooks';

// Polyfill Request for React Router in test environment
if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as any;
}

jest.mock('~/hooks', () => ({
  useAuthContext: jest.fn(),
}));

/**
 * TestComponent that uses the useAuthRedirect hook and exposes its return value
 */
function TestComponent() {
  const result = useAuthRedirect();
  // Expose result for assertions
  (window as any).__testResult = result;
  return <div data-testid="test-component">Test Component</div>;
}

/**
 * Creates a test router with optional basename to verify navigation works correctly
 * with subdirectory deployments (e.g., /librechat)
 */
const createTestRouter = (basename = '/') => {
  // When using basename, initialEntries must include the basename
  const initialEntry = basename === '/' ? '/' : `${basename}/`;

  return createMemoryRouter(
    [
      {
        path: '/',
        element: <TestComponent />,
      },
      {
        path: '/c/new',
        element: <div data-testid="chat-home-page">Chat home</div>,
      },
    ],
    {
      basename,
      initialEntries: [initialEntry],
    },
  );
};

describe('useAuthRedirect', () => {
  beforeEach(() => {
    (window as any).__testResult = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
    (window as any).__testResult = undefined;
  });

  it('should not redirect when user is authenticated', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: { id: '123', email: 'test@example.com' },
      isAuthenticated: true,
    });

    const router = createTestRouter();
    const { getByTestId } = render(<RouterProvider router={router} />);

    expect(router.state.location.pathname).toBe('/');
    expect(getByTestId('test-component')).toBeInTheDocument();

    // Wait for the timeout (300ms) plus a buffer
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Should still be on home page, not redirected
    expect(router.state.location.pathname).toBe('/');
    expect(getByTestId('test-component')).toBeInTheDocument();
  });

  it('should redirect to /c/new when user is not authenticated', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: undefined,
      isAuthenticated: false,
    });

    const router = createTestRouter();
    const { getByTestId, queryByTestId } = render(<RouterProvider router={router} />);

    expect(router.state.location.pathname).toBe('/');
    expect(getByTestId('test-component')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/c/new');
        expect(getByTestId('chat-home-page')).toBeInTheDocument();
        expect(queryByTestId('test-component')).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('should respect router basename when redirecting (subdirectory deployment)', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: undefined,
      isAuthenticated: false,
    });

    const router = createTestRouter('/librechat');
    const { getByTestId } = render(<RouterProvider router={router} />);

    expect(router.state.location.pathname).toBe('/librechat/');

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/librechat/c/new');
        expect(getByTestId('chat-home-page')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('should use React Router navigate (not window.location) for SPA experience', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: undefined,
      isAuthenticated: false,
    });

    const router = createTestRouter('/librechat');
    const { getByTestId } = render(<RouterProvider router={router} />);

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/librechat/c/new');
        expect(getByTestId('chat-home-page')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    expect(router.state.location.pathname).toBe('/librechat/c/new');
  });

  it('should clear timeout on unmount', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: undefined,
      isAuthenticated: false,
    });

    const router = createTestRouter();
    const { unmount } = render(<RouterProvider router={router} />);

    unmount();

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(router.state.location.pathname).toBe('/');
  });

  it('should return user and isAuthenticated values', async () => {
    const mockUser = { id: '123', email: 'test@example.com' };
    (useAuthContext as jest.Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      const testResult = (window as any).__testResult;
      expect(testResult).toBeDefined();
      expect(testResult.user).toEqual(mockUser);
      expect(testResult.isAuthenticated).toBe(true);
    });
  });
});
