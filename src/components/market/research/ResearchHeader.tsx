
import { Button } from "@/components/ui/button"

export interface ResearchHeaderProps {
  onStartResearch: () => void
  onResearch?: () => void
  query?: string
  onQueryChange?: (query: string) => void
  isLoading?: boolean
  isAnalyzing?: boolean
}

export function ResearchHeader({ 
  onStartResearch, 
  onResearch,
  query = "",
  onQueryChange = () => {},
  isLoading = false,
  isAnalyzing = false
}: ResearchHeaderProps) {
  // Use onResearch if provided, otherwise fall back to onStartResearch
  const handleResearch = onResearch || onStartResearch;
  
  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Enter research query..."
          className="flex-grow p-2 bg-background border border-input rounded-md text-sm"
          disabled={isLoading || isAnalyzing}
        />
        <Button 
          onClick={handleResearch}
          disabled={isLoading || isAnalyzing}
        >
          {isLoading || isAnalyzing ? 'Researching...' : 'Research'}
        </Button>
      </div>
    </div>
  )
}
