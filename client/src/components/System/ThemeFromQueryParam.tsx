import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '@librechat/client';
import { parseThemeQueryParam } from '~/utils/themeFromQuery';

/**
 * When the URL has `?theme=light` or `?theme=dark`, apply it.
 * If the param is absent on a navigation, the current theme is left unchanged (localStorage / user choice).
 */
export default function ThemeFromQueryParam() {
  const { search } = useLocation();
  const { setTheme } = useTheme();

  useEffect(() => {
    const t = parseThemeQueryParam(search);
    if (t) {
      setTheme(t);
    }
  }, [search, setTheme]);

  return null;
}
