
import { Button } from "@/components/ui/button"

interface ResearchHeaderProps {
  onStartResearch: () => void
  isResearching: boolean
  query: string
  onQueryChange: (query: string) => void
}

export function ResearchHeader({ 
  onStartResearch, 
  isResearching,
  query,
  onQueryChange
}: ResearchHeaderProps) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Enter research query..."
          className="flex-grow p-2 bg-background border border-input rounded-md text-sm"
          disabled={isResearching}
        />
        <Button 
          onClick={onStartResearch}
          disabled={isResearching || !query.trim()}
        >
          {isResearching ? 'Researching...' : 'Research'}
        </Button>
      </div>
    </div>
  )
}
