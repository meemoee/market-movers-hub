
import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Loader2, Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { useResearchJobs } from '@/hooks/useResearchJobs'
import { useToast } from "@/components/ui/use-toast"

interface BackgroundResearchButtonProps {
  marketId: string
  description: string
  onResearchStarted?: () => void
}

export function BackgroundResearchButton({ marketId, description, onResearchStarted }: BackgroundResearchButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [maxIterations, setMaxIterations] = useState(3)
  const [focusText, setFocusText] = useState('')
  const { createJob, isCreatingJob } = useResearchJobs(marketId)
  const { toast } = useToast()

  const handleStartResearch = async () => {
    try {
      await createJob({
        query: description,
        marketId,
        focusText: focusText || undefined,
        maxIterations
      })

      toast({
        title: "Background research started",
        description: "Your research will continue even if you close this page.",
      })

      setIsDialogOpen(false)

      if (onResearchStarted) {
        onResearchStarted()
      }
    } catch (error) {
      console.error("Error starting research:", error)
      toast({
        title: "Error starting research",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      })
    }
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Search className="mr-2 h-4 w-4" />
          Background Research
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Background Research</DialogTitle>
          <DialogDescription>
            This research will continue running in the background even if you close your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Research Question</label>
            <p className="p-2 bg-muted rounded-md text-sm">{description}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Research Focus (optional)</label>
            <Input
              placeholder="Enter specific research focus..."
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Narrow down your research to specific aspects of the question
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Number of Iterations</label>
              <span className="text-sm font-medium">{maxIterations}</span>
            </div>
            <Slider
              value={[maxIterations]}
              min={1}
              max={10}
              step={1}
              onValueChange={(values) => setMaxIterations(values[0])}
            />
            <p className="text-xs text-muted-foreground">
              Higher values will provide more thorough research but take longer to complete.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleStartResearch} 
            disabled={isCreatingJob}
          >
            {isCreatingJob ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Background Research'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
