import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '~/utils';

type BaseSwitchProps = Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
  'aria-label' | 'aria-labelledby'
>;

type SwitchProps =
  | (BaseSwitchProps & {
      'aria-label': string;
      'aria-labelledby'?: never;
    })
  | (BaseSwitchProps & {
      'aria-labelledby': string;
      'aria-label'?: never;
    });

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
      className={cn(
        'peer inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 relative',
        'data-[state=checked]:bg-[#436AF5] data-[state=unchecked]:bg-[#ADADAD]',
        'dark:data-[state=checked]:bg-[#436AF5] dark:data-[state=unchecked]:bg-[#ADADAD]',
        className,
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full shadow-sm ring-0 transition-transform',
          'data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[2px]',
          'data-[state=checked]:bg-white data-[state=unchecked]:bg-[#F3F6F6]',
          'dark:data-[state=checked]:bg-white dark:data-[state=unchecked]:bg-[#F3F6F6]',
        )}
      />
    </SwitchPrimitives.Root>
  ),
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
