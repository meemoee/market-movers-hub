
import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => {
  // Add useEffect to debug purposes
  React.useEffect(() => {
    if (ref && 'current' in ref && ref.current) {
      console.log(`🔍 ScrollArea mounted with props:`, {
        className,
        props,
        element: ref.current,
        children: ref.current.childNodes
      });
    }
  }, [ref, className, props]);
  
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      {...props}
      asChild={false} // Force using the div to ensure scrolling works as expected
    >
      <ScrollAreaPrimitive.Viewport 
        className="h-full w-full rounded-[inherit] overflow-x-hidden"
        onScroll={(e) => {
          // Debug scroll events
          const target = e.currentTarget;
          const isAtBottom = Math.abs((target.scrollHeight - target.clientHeight) - target.scrollTop) < 30;
          console.log(`📜 ScrollArea viewport scroll: top=${target.scrollTop}, height=${target.scrollHeight}, client=${target.clientHeight}, atBottom=${isAtBottom}`);
        }}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
})
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => {
  // Add ref callback to log when scrollbar is rendered
  const refCallback = React.useCallback((node: HTMLElement | null) => {
    if (node) {
      console.log(`🔍 ScrollBar ${orientation} mounted:`, node);
    }
    
    // Forward the ref
    if (ref) {
      if (typeof ref === 'function') {
        ref(node);
      } else {
        ref.current = node;
      }
    }
  }, [ref, orientation]);
  
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={refCallback}
      orientation={orientation}
      className={cn(
        "flex touch-none select-none transition-colors",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent p-[1px]",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent p-[1px]",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
})
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
