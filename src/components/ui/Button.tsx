import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'action'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-primary/30 bg-primary text-white hover:opacity-95 disabled:bg-primary/60',
  secondary:
    'border border-white/20 bg-white/[0.06] text-white hover:bg-white/[0.09] disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-slate-500',
  ghost:
    'border border-transparent bg-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white disabled:text-slate-600',
  outline:
    'border border-white/20 bg-transparent text-slate-200 hover:bg-white/[0.04] disabled:border-white/10 disabled:text-slate-600',
  action:
    'border border-primary/40 bg-primary/12 text-primary hover:border-primary/60 hover:bg-primary/18 disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-slate-500',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  )
}
