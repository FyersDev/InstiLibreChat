import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { SendIcon, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
};

const SubmitButton = React.memo(
  forwardRef((props: { disabled: boolean }, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    return (
      <TooltipAnchor
        description={localize('com_nav_send_message')}
        render={
          <button
            ref={ref}
            aria-label={localize('com_nav_send_message')}
            id="send-button"
            disabled={props.disabled}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[2px] border border-fig-Stroke-primary',
              'bg-fig-Surface-two-primary p-0 text-fig-Subject-inverse outline-offset-4',
              'transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
            )}
            data-testid="send-button"
            type="submit"
          >
            <span className="" data-state="closed">
              <SendIcon size={16} className="text-fig-Subject-two-primary" />
            </span>
          </button>
        }
      />
    );
  }),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    return <SubmitButton ref={ref} disabled={props.disabled || !data.text} />;
  }),
);

export default SendButton;
