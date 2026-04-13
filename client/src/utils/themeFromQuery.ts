/** `?theme=light` or `?theme=dark` (case-insensitive value). */
export function parseThemeQueryParam(search: string): 'light' | 'dark' | undefined {
  const v = new URLSearchParams(search).get('theme')?.toLowerCase();
  if (v === 'light' || v === 'dark') {
    return v;
  }
  return undefined;
}

export function getInitialThemeFromWindowSearch(): 'light' | 'dark' | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return parseThemeQueryParam(window.location.search);
}
