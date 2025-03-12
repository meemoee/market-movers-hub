
import { useState } from 'react'
import { useResearchJobs } from '@/hooks/useResearchJobs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CheckCircle, Clock, AlertCircle, Loader2, Ban, ChevronRight, ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnalysisDisplay } from "./AnalysisDisplay"
import { SitePreviewList } from "./SitePreviewList"

interface ResearchJobsListProps {
  marketId?: string
  onSelectJob?: (jobId: string) => void
  onStartNewResearch?: () => void
}

export function ResearchJobsList({ marketId, onSelectJob, onStartNewResearch }: ResearchJobsListProps) {
  const { jobs, isLoadingJobs, cancelJob } = useResearchJobs(marketId)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)

  const toggleJobExpand = (jobId: string) => {
    setExpandedJob(prev => prev === jobId ? null : jobId)
  }

  const handleSelectJob = (jobId: string) => {
    if (onSelectJob) {
      onSelectJob(jobId)
    } else {
      setSelectedJob(jobId)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</Badge>
      case 'running':
        return <Badge variant="default" className="bg-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge>
      case 'completed':
        return <Badge variant="default" className="bg-green-500 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>
      case 'failed':
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (isLoadingJobs) {
    return (
      <div className="flex justify-center items-center p-4">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span>Loading research jobs...</span>
      </div>
    )
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground mb-4">No research jobs found</p>
        {onStartNewResearch && (
          <Button variant="outline" onClick={onStartNewResearch}>Start New Research</Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {onStartNewResearch && (
        <div className="flex justify-end mb-4">
          <Button variant="outline" onClick={onStartNewResearch}>Start New Research</Button>
        </div>
      )}

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {jobs.map(job => (
            <Card key={job.id} className="p-0 overflow-hidden">
              <div 
                className="p-3 cursor-pointer hover:bg-accent/10 border-b flex justify-between items-center"
                onClick={() => toggleJobExpand(job.id)}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(job.status)}
                    <span className="text-sm font-medium truncate max-w-[300px]">
                      {job.focus_text || job.query.substring(0, 60) + (job.query.length > 60 ? '...' : '')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Started {job.started_at ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true }) : 'Not started yet'} 
                    • {job.current_iteration} of {job.max_iterations} iterations
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {job.status === 'running' && (
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={(e) => {
                        e.stopPropagation()
                        cancelJob(job.id)
                      }}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                  {job.status === 'completed' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectJob(job.id)
                      }}
                    >
                      View Results
                    </Button>
                  )}
                  {expandedJob === job.id ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </div>
              {expandedJob === job.id && (
                <div className="p-3 border-t bg-accent/5">
                  <h4 className="text-sm font-medium mb-2">Progress Log</h4>
                  <ScrollArea className="h-[150px] border rounded-md p-2">
                    <div className="space-y-1">
                      {job.progress_log.map((log, index) => (
                        <div key={index} className="text-xs">
                          {log}
                        </div>
                      ))}
                      {job.status === 'running' && (
                        <div className="text-xs flex items-center gap-1 text-blue-500">
                          <Loader2 className="h-3 w-3 animate-spin" /> Processing...
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  {job.error_message && (
                    <div className="mt-2 text-xs text-red-500 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>

      {!onSelectJob && selectedJob && (
        <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Research Results</DialogTitle>
            </DialogHeader>
            <ResearchJobDetail jobId={selectedJob} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function ResearchJobDetail({ jobId }: { jobId: string }) {
  const { job, isLoading } = useResearchJob(jobId)
  const [activeTab, setActiveTab] = useState('analysis')

  if (isLoading || !job) {
    return (
      <div className="flex justify-center items-center p-6">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span>Loading research details...</span>
      </div>
    )
  }

  return (
    <div className="overflow-auto flex-1 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium">{job.focus_text || job.query}</h3>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {getStatusBadge(job.status)}
            <span>
              {job.completed_at 
                ? `Completed ${formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}` 
                : `Started ${formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}`}
            </span>
          </div>
        </div>
        
        {job.probability && (
          <Badge className="text-lg py-2 px-4">
            Probability: {job.probability}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-4">
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="sources">Sources ({job.results?.length || 0})</TabsTrigger>
          <TabsTrigger value="iterations">Iterations ({job.iterations?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="h-[400px]">
          {job.analysis ? (
            <AnalysisDisplay content={job.analysis} />
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              Analysis not available yet
            </div>
          )}
        </TabsContent>

        <TabsContent value="sources" className="h-[400px]">
          {job.results && job.results.length > 0 ? (
            <SitePreviewList results={job.results} />
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              No sources available yet
            </div>
          )}
        </TabsContent>

        <TabsContent value="iterations" className="h-[400px]">
          {job.iterations && job.iterations.length > 0 ? (
            <div className="space-y-4">
              {job.iterations.map((iteration: any, idx: number) => (
                <div key={idx} className="border rounded-md p-3">
                  <h4 className="font-medium mb-2">Iteration {iteration.iteration}</h4>
                  <div className="text-sm">
                    <div className="mb-2">
                      <strong>Queries:</strong>
                      <ul className="ml-5 list-disc text-xs space-y-1 mt-1">
                        {iteration.queries.map((q: string, qIdx: number) => (
                          <li key={qIdx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Sources:</strong> {iteration.results?.length || 0} sources found
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              No iterations available yet
            </div>
          )}
        </TabsContent>
      </Tabs>

      {job.areas_for_research && job.areas_for_research.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h4 className="font-medium mb-2">Areas for Further Research</h4>
          <ul className="list-disc ml-5 space-y-1">
            {job.areas_for_research.map((area: string, idx: number) => (
              <li key={idx} className="text-sm">{area}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</Badge>
    case 'running':
      return <Badge variant="default" className="bg-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge>
    case 'completed':
      return <Badge variant="default" className="bg-green-500 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>
    case 'failed':
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}
