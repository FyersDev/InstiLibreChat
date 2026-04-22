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
      data-sidebar-edge-tab
      data-testid={navVisible ? 'close-sidebar-button' : 'open-sidebar-button'}
      aria-label={navVisible ? localize('com_nav_close_sidebar') : localize('com_nav_open_sidebar')}
      onClick={persistAndToggle}
      className={cn(
        'max-md:hidden',
        'group absolute z-50 box-border flex h-6 w-2 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center p-0 transition-[width,height] duration-200 ease-out hover:h-8 hover:w-3 !border-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        navVisible
          ? 'left-0 top-1/2 !rounded-br-[8px] !rounded-tr-[8px] hover:!rounded-br-[8px] hover:!rounded-tr-[8px] bg-[#111111] text-white hover:bg-[#1a1a1a] dark:bg-[#ffffff] dark:text-black dark:hover:bg-neutral-100'
          : 'left-0 top-[calc(50%+4px)] !rounded-bl-[8px] !rounded-tl-[8px] hover:!rounded-bl-[8px] hover:!rounded-tl-[8px] bg-[#2434E7] text-white hover:bg-[#1c2ac9]',
      )}
    >
      {navVisible ? (
        <ChevronLeft
          className="h-3 w-2 shrink-0 text-white transition-[width,height] duration-200 ease-out group-hover:h-4 group-hover:w-3 dark:text-black"
          strokeWidth={2.5}
          aria-hidden
        />
      ) : (
        <ChevronRight
          className="h-3 w-2 shrink-0 transition-[width,height] duration-200 ease-out group-hover:h-4 group-hover:w-3"
          strokeWidth={2.5}
          aria-hidden
        />
      )}
    </button>
  );
}
