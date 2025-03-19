
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing?: boolean
  onResearch: () => void
  title?: string
  description?: string
  onRunResearch?: () => Promise<void>
  loadSavedResearch?: (research: any) => void
  savedResearch?: any[]
  marketId?: string
  subtitle?: string
  badgeText?: string
  badgeVariant?: string
}

export function ResearchHeader({ 
  isLoading, 
  isAnalyzing = false, 
  onResearch,
  title,
  description, 
  onRunResearch,
  loadSavedResearch,
  savedResearch,
  marketId,
  subtitle,
  badgeText,
  badgeVariant
}: ResearchHeaderProps) {
  // Ensure we call onResearch without any parameters to prevent passing the event object
  const handleResearchClick = () => {
    if (onRunResearch) {
      onRunResearch();
    } else {
      onResearch();
    }
  };

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title || "Web Research"}</h3>
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
  )
}
