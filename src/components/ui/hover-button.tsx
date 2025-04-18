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
          "w-[80px] min-h-[48px] px-2 py-1.5",
          "text-foreground font-medium",
          "transition-colors duration-200",
          "backdrop-blur-sm",
          variant === 'buy' 
            ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500"
            : "bg-red-500/10 hover:bg-red-500/20 text-red-500",
          "rounded-md",
          "flex flex-col items-center justify-between",
          className
        )}
        {...props}
      >
        <div className="text-xs leading-tight">
          {React.Children.toArray(children)[0]}
        </div>
        <div className="text-[11px] font-medium opacity-90 mt-0.5">
          {React.Children.toArray(children)[1]}
        </div>
      </button>
    )
  }
)

HoverButton.displayName = "HoverButton"

export { HoverButton }