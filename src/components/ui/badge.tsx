import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap',
  {
    variants: {
      variant: {
        high: 'bg-[#e7f6ec] text-[#14532d] border-[#bbe5c8]',
        medium: 'bg-[#fdf3e3] text-caution border-[#f0dcb8]',
        neutral: 'bg-muted-bg text-muted border-line',
        untrusted: 'bg-[#fdecea] text-danger border-[#f5cdc8]',
        proposed: 'bg-[#e8effb] text-[#1e40af] border-[#c3d5f5]',
        accepted: 'bg-[#e7f6ec] text-[#14532d] border-[#bbe5c8]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
