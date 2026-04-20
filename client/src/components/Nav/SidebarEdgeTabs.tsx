import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * FYERS / FIA: semi-circular edge tabs on the chat/main column seam (desktop).
 * Expand (collapsed nav): primary blue, chevron right — Figma node 174:136291.
 * Collapse (open nav): inverse surface, chevron left — node 144:118789.
 */
export default function SidebarEdgeTabs({
  navVisible,
  setNavVisible,
}: {
  navVisible: boolean;
  setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const localize = useLocalize();

  const persistAndToggle = () => {
    setNavVisible((prev) => {
      const next = !prev;
      localStorage.setItem('navVisible', JSON.stringify(next));
      return next;
    });
  };

  return (
    <button
      type="button"
      data-testid={navVisible ? 'close-sidebar-button' : 'open-sidebar-button'}
      aria-label={navVisible ? localize('com_nav_close_sidebar') : localize('com_nav_open_sidebar')}
      onClick={persistAndToggle}
      className={cn(
        'max-md:hidden',
        '-translate-y-1/2 absolute z-50 flex h-6 cursor-pointer items-center justify-center border-0 px-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        navVisible
          ? 'top-1/2 left-0 rounded-br-lg rounded-tr-lg bg-[#111] text-white hover:bg-[#1a1a1a]'
          : 'top-[calc(50%+4px)] left-0 rounded-br-lg rounded-tr-lg bg-[#2434E7] text-white hover:bg-[#1c2ac9]',
      )}
    >
      {navVisible ? (
        <ChevronLeft className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
      ) : (
        <ChevronRight className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
      )}
    </button>
  );
}
