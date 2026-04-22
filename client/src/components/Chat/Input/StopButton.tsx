import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function StopButton({ stop, setShowStopButton }) {
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description={localize('com_nav_stop_generating')}
      render={
        <button
          type="button"
          className={cn(
            'border-fig-Stroke-primary flex h-8 w-8 items-center justify-center rounded-[2px] border',
            'bg-fig-Surface-two-primary text-fig-Subject-inverse p-0 outline-offset-4',
            'transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
          )}
          aria-label={localize('com_nav_stop_generating')}
          onClick={(e) => {
            setShowStopButton(false);
            stop(e);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-fig-Subject-two-primary h-4 w-4"
            aria-hidden
          >
            <rect x="7" y="7" width="10" height="10" rx="1.25" fill="currentColor" />
          </svg>
        </button>
      }
    />
  );
}
