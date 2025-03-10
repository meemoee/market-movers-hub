
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Target, IterationCw, Info, GitBranch, Braces } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ResearchHeaderProps {
  isLoading: boolean
  isAnalyzing: boolean
  onResearch: () => void
  focusText?: string
  iteration?: number
  researchPath?: {
    depth: number
    totalBranches: number
  }
  showQueryPatterns?: () => void
  showResearchTree?: () => void
  queryEffectiveness?: number
}

export function ResearchHeader({ 
  isLoading, 
  isAnalyzing, 
  onResearch, 
  focusText,
  iteration = 1,
  researchPath,
  showQueryPatterns,
  showResearchTree,
  queryEffectiveness
}: ResearchHeaderProps) {
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
        {iteration > 1 && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <IterationCw className="h-3 w-3" />
            <span>Iteration {iteration}</span>
          </Badge>
        )}
        
        {researchPath && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="flex items-center gap-1 cursor-help">
                  <GitBranch className="h-3 w-3" />
                  <span>Depth {researchPath.depth}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Research depth: {researchPath.depth} levels</p>
                <p>Total branches: {researchPath.totalBranches}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {queryEffectiveness !== undefined && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant={queryEffectiveness >= 7 ? "default" : queryEffectiveness >= 4 ? "secondary" : "destructive"} 
                  className="flex items-center gap-1 cursor-help"
                >
                  <Braces className="h-3 w-3" />
                  <span>Query Quality: {queryEffectiveness}/10</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Overall query effectiveness score</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {showQueryPatterns && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={showQueryPatterns}
            disabled={isLoading || isAnalyzing}
          >
            <Info className="mr-2 h-4 w-4" />
            Query Patterns
          </Button>
        )}
        
        {showResearchTree && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={showResearchTree}
            disabled={isLoading || isAnalyzing}
          >
            <GitBranch className="mr-2 h-4 w-4" />
            Research Tree
          </Button>
        )}
        
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
    </div>
  )
}
