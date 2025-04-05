
import { SimpleScrollingContent } from "./SimpleScrollingContent"

interface AnalysisDisplayProps {
  content: string
  isStreaming?: boolean
  maxHeight?: string | number
}

export function AnalysisDisplay({ 
  content, 
  isStreaming = false, 
  maxHeight = "200px" 
}: AnalysisDisplayProps) {
  if (!content) return null
  
  return (
    <SimpleScrollingContent 
      content={content}
      isStreaming={isStreaming}
      maxHeight={maxHeight}
    />
  )
}
