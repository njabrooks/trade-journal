import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // Entity status variants (ui-patterns.md §4)
        draft: "border-transparent bg-muted text-muted-foreground",
        active: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        developing: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
        monitoring: "border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400",
        complete: "border-transparent bg-muted text-muted-foreground",
        rejected: "border-transparent bg-destructive/15 text-destructive",
        merged: "border-transparent bg-orange-500/15 text-orange-600 dark:text-orange-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

// Entity status type for type-safe status badges
type EntityStatus = 'draft' | 'active' | 'developing' | 'monitoring' | 'complete' | 'rejected' | 'merged';

// Helper component for entity status badges
function EntityStatusBadge({
  status,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, 'children'> & { status: EntityStatus | string }) {
  // Map status to variant, defaulting to secondary for unknown statuses
  const variant = ['draft', 'active', 'developing', 'monitoring', 'complete', 'rejected', 'merged'].includes(status)
    ? (status as EntityStatus)
    : 'secondary';

  return (
    <Badge variant={variant} className={className} {...props}>
      {status}
    </Badge>
  );
}

export { Badge, badgeVariants, EntityStatusBadge }
export type { EntityStatus }
