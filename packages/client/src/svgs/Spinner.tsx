import { cn } from '~/utils/';
import { useTheme } from '../theme';

interface SpinnerProps {
  className?: string;
  size?: string | number;
  color?: string;
  bgOpacity?: number;
  speed?: number;
}

export default function Spinner({
  className = 'm-auto',
  size = 20,
}: SpinnerProps) {
  const { theme } = useTheme();
  
  // Determine which loader GIF to use based on theme
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  // Use import.meta.env.BASE_URL which comes from Vite config (configurable via VITE_BASE_PATH)
  const basePath = import.meta.env.BASE_URL || '/research/';
  const loaderSrc = `${basePath}assets/loader_${isDark ? 'dark' : 'light'}.gif`;

  return (
    <img
      src={loaderSrc}
      alt="Loading..."
      className={cn(className)}
      style={{ width: size, height: size }}
    />
  );
}
