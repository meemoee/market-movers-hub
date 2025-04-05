
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

interface SimpleScrollingContentProps {
  children: React.ReactNode
  className?: string
  maxHeight?: string | number
  isStreaming?: boolean
  shouldAutoScroll?: boolean
  onScrollToBottom?: () => void
  onScrollAwayFromBottom?: () => void
}

export function SimpleScrollingContent({
  children,
  className,
  maxHeight = "200px",
  isStreaming = false,
  shouldAutoScroll = true,
  onScrollToBottom,
  onScrollAwayFromBottom
}: SimpleScrollingContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [contentChanged, setContentChanged] = useState(false)
  const lastContentHeight = useRef(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  
  // Setup intersection observer to detect when we're at the bottom
  useEffect(() => {
    if (!containerRef.current) return
    
    const bottomMarker = document.createElement('div')
    bottomMarker.style.height = '1px'
    containerRef.current.appendChild(bottomMarker)
    
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        const wasAtBottom = atBottom
        const nowAtBottom = entry.isIntersecting
        
        if (wasAtBottom !== nowAtBottom) {
          setAtBottom(nowAtBottom)
          
          if (nowAtBottom) {
            onScrollToBottom?.()
          } else {
            onScrollAwayFromBottom?.()
          }
        }
      }, 
      { root: containerRef.current, threshold: 0.1 }
    )
    
    observerRef.current.observe(bottomMarker)
    
    return () => {
      observerRef.current?.disconnect()
      bottomMarker.remove()
    }
  }, [onScrollAwayFromBottom, onScrollToBottom, atBottom])
  
  // Monitor content changes via MutationObserver
  useEffect(() => {
    if (!contentRef.current) return

    const observer = new MutationObserver(() => {
      if (contentRef.current) {
        const newHeight = contentRef.current.scrollHeight
        if (newHeight !== lastContentHeight.current) {
          lastContentHeight.current = newHeight
          setContentChanged(true)
          
          // Reset the flag after a brief delay
          setTimeout(() => setContentChanged(false), 100)
        }
      }
    })
    
    observer.observe(contentRef.current, {
      childList: true,
      subtree: true,
      characterData: true
    })
    
    return () => observer.disconnect()
  }, [])
  
  // Handle auto scrolling when content changes
  useEffect(() => {
    if (contentChanged && shouldAutoScroll && atBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      console.log('SimpleScrollingContent: Auto-scrolled to bottom after content change')
    }
  }, [contentChanged, shouldAutoScroll, atBottom])
  
  // Force scroll to bottom when streaming starts or shouldAutoScroll changes
  useEffect(() => {
    if (shouldAutoScroll && isStreaming && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      console.log('SimpleScrollingContent: Forced scroll to bottom due to streaming or auto-scroll change')
    }
  }, [shouldAutoScroll, isStreaming])
  
  // Manual scroll to bottom handler
  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setAtBottom(true)
      onScrollToBottom?.()
    }
  }

  return (
    <div className="relative w-full">
      <div 
        ref={containerRef}
        className={cn(
          "overflow-y-auto overflow-x-hidden w-full",
          className
        )}
        style={{ maxHeight, height: maxHeight }}
      >
        <div ref={contentRef} className="w-full max-w-full">
          {children}
        </div>
      </div>
      
      {!atBottom && (
        <Button 
          onClick={scrollToBottom}
          variant="outline" 
          size="sm" 
          className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm flex items-center gap-1 py-1 px-2 h-auto"
        >
          <ChevronDown className="h-3 w-3" />
          <span className="text-xs">Scroll down</span>
        </Button>
      )}
    </div>
  )
}
