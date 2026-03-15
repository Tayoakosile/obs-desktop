import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}

const toneClasses = {
  neutral: 'bg-white/[0.03] text-slate-300 border border-white/10',
  primary: 'bg-primary/15 text-primary border border-primary/25',
  success: 'bg-emerald-500/10 text-emerald-200 border border-emerald-400/20',
  warning: 'bg-amber-500/10 text-amber-200 border border-amber-400/20',
  danger: 'bg-red-500/10 text-red-200 border border-red-400/20',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
