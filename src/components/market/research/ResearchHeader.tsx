
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing: boolean
  onResearch: () => void
  jobStatus?: string
}

export function ResearchHeader({ isLoading, isAnalyzing, onResearch, jobStatus }: ResearchHeaderProps) {
  // Ensure we call onResearch without any parameters to prevent passing the event object
  const handleResearchClick = () => {
    onResearch();
  };

  const getButtonText = () => {
    if (isLoading) return 'Researching...';
    if (isAnalyzing) return 'Analyzing...';
    if (jobStatus === 'queued') return 'Queued';
    if (jobStatus === 'processing') return 'Processing...';
    return 'Research';
  };

  const isButtonDisabled = isLoading || isAnalyzing || ['queued', 'processing'].includes(jobStatus || '');

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">Web Research</h3>
      <Button 
        onClick={handleResearchClick} 
        disabled={isButtonDisabled}
        variant="outline"
        size="sm"
      >
        {isButtonDisabled ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {getButtonText()}
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
