import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-10 rounded-[10px] border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-muted disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full min-h-[150px] rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[14px] leading-relaxed text-ink resize-y',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Input, Textarea }
