import { type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { badgeVariants } from '@/components/ui/badge-variants'
import { cn } from '@/lib/utils'

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
