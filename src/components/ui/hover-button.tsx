"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface HoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'buy' | 'sell';
}

const HoverButton = React.forwardRef<HTMLButtonElement, HoverButtonProps>(
  ({ className, children, variant = 'buy', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "w-[80px] px-2 py-3",
          "text-foreground font-medium text-xs",
          "transition-colors duration-200",
          "backdrop-blur-sm",
          variant === 'buy' 
            ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500"
            : "bg-red-500/10 hover:bg-red-500/20 text-red-500",
          "rounded-md",
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

HoverButton.displayName = "HoverButton"

export { HoverButton }