
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing: boolean
  onResearch: () => void
  showReasoning?: boolean
  onToggleReasoning?: () => void
}

export function ResearchHeader({ 
  isLoading, 
  isAnalyzing, 
  onResearch,
  showReasoning = false,
  onToggleReasoning
}: ResearchHeaderProps) {
  // Ensure we call onResearch without any parameters to prevent passing the event object
  const handleResearchClick = () => {
    onResearch();
  };

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">Web Research</h3>
      <div className="flex items-center space-x-2">
        {onToggleReasoning && (
          <Button
            onClick={onToggleReasoning}
            variant="outline" 
            size="sm"
            disabled={isLoading || isAnalyzing}
          >
            {showReasoning ? 'Hide Reasoning' : 'Show Reasoning'}
          </Button>
        )}
        <Button 
          onClick={handleResearchClick} 
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
    </div>
  )
}
