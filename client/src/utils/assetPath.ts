/**
 * Get the correct asset path with base URL
 * Vite automatically provides import.meta.env.BASE_URL based on the `base` config
 */
export function getAssetPath(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // import.meta.env.BASE_URL comes from vite.config.ts base: '/research/'
  const baseUrl = import.meta.env.BASE_URL || '/';
  
  // Combine base URL with path
  return `${baseUrl}${cleanPath}`.replace(/\/+/g, '/');
}

/**
 * For convenience, export a function specifically for assets folder
 */
export function asset(filename: string): string {
  return getAssetPath(`assets/${filename}`);
}
