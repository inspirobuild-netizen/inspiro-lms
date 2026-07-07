import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-brand-violet/20 text-violet-300',
        teal: 'bg-brand-teal/15 text-teal-300',
        amber: 'bg-brand-amber/15 text-amber-300',
        rose: 'bg-brand-rose/15 text-rose-300',
        slate: 'bg-white/8 text-slate-400',
        success: 'bg-emerald-500/15 text-emerald-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
