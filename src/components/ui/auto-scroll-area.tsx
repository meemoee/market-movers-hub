
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface AutoScrollAreaProps {
  className?: string
  children: React.ReactNode
  autoScroll?: boolean
  maxHeight?: string | number
  onScrolledAwayFromBottom?: () => void
  onScrolledToBottom?: () => void
}

export const AutoScrollArea = ({
  className,
  children,
  autoScroll = true,
  maxHeight = "200px",
  onScrolledAwayFromBottom,
  onScrolledToBottom
}: AutoScrollAreaProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)
  const previousContentHeight = useRef<number>(0)
  
  // Check if user has scrolled away from bottom
  const handleScroll = () => {
    if (!containerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const scrolledToBottom = Math.abs((scrollHeight - clientHeight) - scrollTop) < 10
    
    if (isScrolledToBottom !== scrolledToBottom) {
      setIsScrolledToBottom(scrolledToBottom)
      
      if (scrolledToBottom) {
        onScrolledToBottom?.()
      } else {
        onScrolledAwayFromBottom?.()
      }
    }
  }
  
  // Observe content changes and scroll to bottom if needed
  useEffect(() => {
    if (!contentRef.current || !containerRef.current) return
    
    const container = containerRef.current
    const content = contentRef.current
    
    const observer = new MutationObserver(() => {
      // If content height changed and we're auto-scrolling, scroll to bottom
      const currentContentHeight = content.scrollHeight
      
      if (currentContentHeight !== previousContentHeight.current) {
        previousContentHeight.current = currentContentHeight
        
        // Only auto-scroll if we're at the bottom or autoScroll is forced
        if (autoScroll && isScrolledToBottom) {
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight
            }
          })
        }
      }
    })
    
    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    })
    
    return () => observer.disconnect()
  }, [autoScroll, isScrolledToBottom])
  
  // Initial scroll to bottom and scroll when autoScroll changes
  useLayoutEffect(() => {
    if (!containerRef.current) return
    
    if (autoScroll && isScrolledToBottom) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [autoScroll, children, isScrolledToBottom])
  
  return (
    <div 
      ref={containerRef}
      className={cn(
        "overflow-y-auto overflow-x-hidden relative", 
        className
      )}
      style={{ maxHeight, height: maxHeight }}
      onScroll={handleScroll}
    >
      <div ref={contentRef} className="w-full">
        {children}
      </div>
      
      {autoScroll === false && !isScrolledToBottom && (
        <button
          onClick={() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight
              setIsScrolledToBottom(true)
              onScrolledToBottom?.()
            }
          }}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors"
        >
          Scroll to bottom
        </button>
      )}
    </div>
  )
}
