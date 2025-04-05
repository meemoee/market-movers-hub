
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { ArrowDown } from "lucide-react"

interface SimpleScrollingContentProps {
  content: string
  isStreaming?: boolean
  maxHeight?: string | number
  className?: string
}

export function SimpleScrollingContent({
  content,
  isStreaming = false,
  maxHeight = "200px",
  className = ""
}: SimpleScrollingContentProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTargetRef = useRef<HTMLDivElement>(null)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const lastScrollPositionRef = useRef<number>(0)
  const contentLengthRef = useRef<number>(0)

  // Detect content changes
  const hasContentChanged = content.length !== contentLengthRef.current
  if (hasContentChanged) {
    contentLengthRef.current = content.length
  }

  // Scroll to bottom function that properly controls scrolling within the container
  const scrollToBottom = useCallback(() => {
    if (!scrollContainerRef.current || !shouldAutoScroll || !scrollTargetRef.current) return
    
    const container = scrollContainerRef.current;
    
    // First set scrollTop directly for immediate effect
    container.scrollTop = container.scrollHeight;
    
    // Then use scrollIntoView with containment to ensure it stays within the container
    // and doesn't affect the page viewport
    try {
      scrollTargetRef.current.scrollIntoView({ 
        block: "end", 
        inline: "nearest",
        behavior: "auto" 
      });
      console.log("Scrolled to bottom with combined approach")
    } catch (err) {
      console.error("Error in scrollIntoView:", err)
    }
  }, [shouldAutoScroll])

  // Detect user scroll
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const isAtBottom = Math.abs((scrollHeight - clientHeight) - scrollTop) < 30
    
    // Track last scroll position
    const userInitiatedScroll = Math.abs(scrollTop - lastScrollPositionRef.current) > 5
    lastScrollPositionRef.current = scrollTop
    
    if (userInitiatedScroll) {
      console.log("User scroll detected, at bottom:", isAtBottom)
      setUserHasScrolled(true)
      setShouldAutoScroll(isAtBottom)
    }
  }, [])

  // Use useLayoutEffect to ensure scrolling happens before browser paint
  useLayoutEffect(() => {
    // Only auto-scroll if streaming and content has changed
    if (isStreaming && hasContentChanged && shouldAutoScroll) {
      console.log("Content changed, scrolling to bottom")
      scrollToBottom()
    }
  }, [content, isStreaming, scrollToBottom, shouldAutoScroll, hasContentChanged])

  // Reset user scrolled state when content is completely reset
  useLayoutEffect(() => {
    if (content.length === 0) {
      setUserHasScrolled(false)
      setShouldAutoScroll(true)
    }
  }, [content.length])

  return (
    <div className="relative w-full">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`overflow-y-auto overflow-x-hidden rounded-md border p-4 bg-accent/5 w-full ${className}`}
        style={{ height: maxHeight, maxHeight }}
      >
        <div className="w-full max-w-full">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm break-words prose-p:my-1 prose-headings:my-2 max-w-full">
            {content}
          </ReactMarkdown>
        </div>
        {/* Invisible element at bottom used as scroll target to ensure containment */}
        <div ref={scrollTargetRef} style={{ height: "1px", width: "100%" }} />
      </div>

      {isStreaming && !shouldAutoScroll && userHasScrolled && (
        <Button
          onClick={() => {
            setShouldAutoScroll(true)
            scrollToBottom()
            setUserHasScrolled(false)
          }}
          className="absolute bottom-2 left-2 bg-primary/20 hover:bg-primary/30 text-xs px-2 py-1 rounded transition-colors flex items-center gap-1"
          size="sm"
          variant="ghost"
        >
          <ArrowDown className="h-3 w-3" />
          Resume auto-scroll
        </Button>
      )}
      
      {isStreaming && (
        <div className="absolute bottom-2 right-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              Streaming...
            </span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-75" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-150" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
