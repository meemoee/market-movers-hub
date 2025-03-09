
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing: boolean
  onResearch: () => void
  focusText?: string
  parentFocusText?: string
}

export function ResearchHeader({ 
  isLoading, 
  isAnalyzing, 
  onResearch, 
  focusText, 
  parentFocusText 
}: ResearchHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold">
          {focusText ? 'Focused Research' : 'Web Research'}
        </h3>
        {focusText && (
          <p className="text-sm text-muted-foreground mt-1">
            Focus: {focusText}
            {parentFocusText && (
              <span className="text-xs block">
                Parent focus: {parentFocusText}
              </span>
            )}
          </p>
        )}
      </div>
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
