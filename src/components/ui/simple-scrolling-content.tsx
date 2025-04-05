
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
  const isScrollingRef = useRef(false)
  const observerRef = useRef<MutationObserver | null>(null)
  const bottomObserverRef = useRef<IntersectionObserver | null>(null)
  const bottomMarkerRef = useRef<HTMLDivElement | null>(null)
  
  // Create and track bottom marker element
  useEffect(() => {
    if (!containerRef.current) return
    
    // Create bottom marker element if it doesn't exist
    if (!bottomMarkerRef.current) {
      const marker = document.createElement('div')
      marker.style.height = '1px'
      marker.style.width = '100%'
      marker.setAttribute('data-scroll-marker', 'true')
      containerRef.current.appendChild(marker)
      bottomMarkerRef.current = marker
    }
    
    // Setup intersection observer for bottom detection
    bottomObserverRef.current = new IntersectionObserver(
      ([entry]) => {
        if (isScrollingRef.current) return // Don't trigger during programmatic scrolling
        
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
      { 
        root: containerRef.current, 
        threshold: 0.1,
        rootMargin: '0px 0px 10px 0px' // More forgiving bottom detection
      }
    )
    
    if (bottomMarkerRef.current) {
      bottomObserverRef.current.observe(bottomMarkerRef.current)
    }
    
    return () => {
      bottomObserverRef.current?.disconnect()
    }
  }, [onScrollAwayFromBottom, onScrollToBottom, atBottom])
  
  // Monitor content changes via MutationObserver
  useEffect(() => {
    if (!contentRef.current) return

    const observer = new MutationObserver(() => {
      if (contentRef.current) {
        const newHeight = contentRef.current.scrollHeight
        if (newHeight !== lastContentHeight.current) {
          console.log(`SimpleScrollingContent: Content height changed from ${lastContentHeight.current} to ${newHeight}`);
          lastContentHeight.current = newHeight
          setContentChanged(true)
        }
      }
    })
    
    observer.observe(contentRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    })
    
    observerRef.current = observer
    
    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [])
  
  // Handle auto scrolling when content changes
  useEffect(() => {
    if (contentChanged && shouldAutoScroll && containerRef.current) {
      // Use RAF to ensure DOM has updated before scrolling
      requestAnimationFrame(() => {
        if (containerRef.current && (atBottom || isStreaming)) {
          isScrollingRef.current = true // Set flag to prevent observer callbacks
          containerRef.current.scrollTop = containerRef.current.scrollHeight
          console.log('SimpleScrollingContent: Auto-scrolled to bottom after content change')
          
          // Reset scrolling flag after animation completes
          setTimeout(() => {
            isScrollingRef.current = false
          }, 100)
        }
        setContentChanged(false)
      });
    }
  }, [contentChanged, shouldAutoScroll, atBottom, isStreaming])
  
  // Force scroll to bottom when streaming starts or shouldAutoScroll changes to true
  useEffect(() => {
    if (shouldAutoScroll && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          isScrollingRef.current = true
          containerRef.current.scrollTop = containerRef.current.scrollHeight
          console.log('SimpleScrollingContent: Forced scroll due to autoScroll prop change')
          
          // Reset scrolling flag after animation completes
          setTimeout(() => {
            isScrollingRef.current = false
          }, 100)
        }
      });
    }
  }, [shouldAutoScroll])

  // Separate effect for streaming to ensure we scroll on every render during streaming
  useEffect(() => {
    if (isStreaming && shouldAutoScroll && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          isScrollingRef.current = true
          containerRef.current.scrollTop = containerRef.current.scrollHeight
          
          // Reset scrolling flag after animation completes
          setTimeout(() => {
            isScrollingRef.current = false
          }, 100)
        }
      });
    }
  }, [isStreaming, children, shouldAutoScroll])
  
  // Manual scroll to bottom handler
  const scrollToBottom = () => {
    if (containerRef.current) {
      isScrollingRef.current = true
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setAtBottom(true)
      onScrollToBottom?.()
      
      // Reset scrolling flag after animation completes
      setTimeout(() => {
        isScrollingRef.current = false
      }, 100)
    }
  }

  return (
    <div className="relative w-full">
      <div 
        ref={containerRef}
        className={cn(
          "overflow-y-auto overflow-x-hidden w-full scroll-smooth",
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
          className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm flex items-center gap-1 py-1 px-2 h-auto z-10"
        >
          <ChevronDown className="h-3 w-3" />
          <span className="text-xs">Scroll down</span>
        </Button>
      )}
    </div>
  )
}
