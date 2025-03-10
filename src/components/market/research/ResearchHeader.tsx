
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Target } from "lucide-react"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing: boolean
  onResearch: () => void
  focusText?: string
}

export function ResearchHeader({ isLoading, isAnalyzing, onResearch, focusText }: ResearchHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">Web Research</h3>
        {focusText && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{focusText}</span>
          </Badge>
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
