
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing: boolean
  onResearch: () => void
  focusText?: string
  parentFocusText?: string
}

export function ResearchHeader({ isLoading, isAnalyzing, onResearch, focusText, parentFocusText }: ResearchHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">
        {focusText ? (
          <span>
            Focused Research: <span className="text-primary">{focusText}</span>
            {parentFocusText && (
              <span className="text-xs text-muted-foreground ml-2">
                (from {parentFocusText})
              </span>
            )}
          </span>
        ) : (
          "Web Research"
        )}
      </h3>
      <Button 
        onClick={onResearch} 
        disabled={isLoading || isAnalyzing}
        variant="outline"
        size="sm"
      >
        {isLoading || isAnalyzing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isAnalyzing ? 'Analyzing...' : 'Researching...'}
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" />
            Research
          </>
        )}
      </Button>
    </div>
  )
}
