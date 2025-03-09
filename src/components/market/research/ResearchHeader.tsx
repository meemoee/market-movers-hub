
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
          <Badge variant="outline" className="text-xs">
            Focus: {focusText.length > 25 ? `${focusText.substring(0, 25)}...` : focusText}
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
