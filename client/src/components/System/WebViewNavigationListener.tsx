import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Listens for navigation messages from Flutter WebView via postMessage
 * Message format: { type: 'navigate', path: '/templates' }
 */
export default function WebViewNavigationListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: validate origin if needed
      // if (event.origin !== 'https://your-flutter-app.com') return;
      
      const { type, path } = event.data || {};
      
      if (type === 'navigate' && typeof path === 'string') {
        console.log('[WebViewNav] Navigating to:', path);
        navigate(path);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

  return null;
}
