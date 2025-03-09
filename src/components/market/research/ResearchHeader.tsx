
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing: boolean
  onResearch: (directFocus?: string) => void
  isFocusMode?: boolean
}

export function ResearchHeader({ isLoading, isAnalyzing, onResearch, isFocusMode }: ResearchHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">
        Web Research
        {isFocusMode && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Focus Mode</span>}
      </h3>
      <Button 
        onClick={() => onResearch()} 
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
            {isFocusMode ? 'Refocus' : 'Research'}
          </>
        )}
      </Button>
    </div>
  )
}
