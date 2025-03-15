
import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"
import { supabase } from "@/integrations/supabase/client"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { PlayIcon, PauseIcon, Trash2Icon, InfoIcon, StopCircleIcon } from 'lucide-react'
import { useToast } from "@/components/ui/use-toast"
import { Json } from '@/integrations/supabase/types'
import { format } from 'date-fns'
import { useResearchJob } from '@/hooks/useResearchJob'
import { ensureString } from '@/utils/progressUtils'

interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
  jobId?: string;
  onDeleteJob?: (jobId: string) => void;
}

export function JobQueueResearchCard({ 
  description, 
  marketId, 
  jobId,
  onDeleteJob
}: JobQueueResearchCardProps) {
  const [isJobStartedLocally, setIsJobStartedLocally] = useState(false);
  const { toast } = useToast();
  
  const {
    job,
    isLoading,
    error,
    progress,
    progressPercent,
    startJob,
    pauseJob,
    resumeJob,
    cancelJob,
    refreshJob
  } = useResearchJob(jobId, marketId);
  
  const isActive = job?.status === 'running' || job?.status === 'queued';
  const isPaused = job?.status === 'paused';
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';
  
  // Convert progress log items to strings for display
  const progressStrings = progress?.map(item => ensureString(item)) || [];
  
  const handleStartJob = async () => {
    try {
      setIsJobStartedLocally(true);
      
      await startJob(description);
      
      toast({
        title: "Research job started",
        description: "Your research job has been queued and will start processing shortly.",
      });
    } catch (error) {
      console.error("Error in research job:", error);
      toast({
        title: "Error",
        description: `Failed to start research: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  };
  
  const handlePauseResumeJob = async () => {
    try {
      if (isPaused) {
        await resumeJob();
        toast({
          title: "Job resumed",
          description: "Your research job has been resumed.",
        });
      } else {
        await pauseJob();
        toast({
          title: "Job paused",
          description: "Your research job has been paused and can be resumed later.",
        });
      }
    } catch (error) {
      console.error("Error pausing/resuming job:", error);
      toast({
        title: "Error",
        description: `Failed to ${isPaused ? 'resume' : 'pause'} job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  };
  
  const handleCancelJob = async () => {
    if (!job?.id) return;
    
    try {
      await cancelJob();
      
      toast({
        title: "Job cancelled",
        description: "Your research job has been cancelled.",
      });
      
      if (onDeleteJob) {
        onDeleteJob(job.id);
      }
    } catch (error) {
      console.error("Error cancelling job:", error);
      toast({
        title: "Error",
        description: `Failed to cancel job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  };
  
  const handleDeleteJob = async () => {
    if (!job?.id) return;
    
    try {
      const { error } = await supabase
        .from('research_jobs')
        .delete()
        .eq('id', job.id);
      
      if (error) throw error;
      
      toast({
        title: "Job deleted",
        description: "Your research job has been deleted.",
      });
      
      if (onDeleteJob) {
        onDeleteJob(job.id);
      }
    } catch (error) {
      console.error("Error deleting job:", error);
      toast({
        title: "Error",
        description: `Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  };
  
  // Auto refresh job status periodically while the job is active
  useEffect(() => {
    if (!job?.id || !isActive) return;
    
    const interval = setInterval(() => {
      refreshJob();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [job?.id, isActive, refreshJob]);
  
  // Render a placeholder while creating a job
  if (!job && isJobStartedLocally) {
    return (
      <Card className="p-4 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Initializing Research...</h3>
        </div>
        <Progress value={5} className="h-2" />
        <div className="text-sm text-muted-foreground">
          Starting up your research job...
        </div>
      </Card>
    );
  }
  
  // Render start button if no job exists
  if (!job && !isJobStartedLocally) {
    return (
      <Card className="p-4 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Background Research</h3>
        </div>
        <div className="text-sm">
          <p className="mb-4">Start a background research job to analyze this market while you're away.</p>
          <Button 
            onClick={handleStartJob} 
            className="w-full"
            disabled={isLoading}
          >
            <PlayIcon className="mr-2 h-4 w-4" />
            Start Background Research
          </Button>
        </div>
      </Card>
    );
  }
  
  // Display error if job couldn't be loaded
  if (error) {
    return (
      <Card className="p-4 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Research Error</h3>
        </div>
        <div className="text-sm text-red-500">
          {error instanceof Error ? error.message : 'Unknown error loading research job'}
        </div>
      </Card>
    );
  }
  
  if (!job) {
    return (
      <Card className="p-4 space-y-4 w-full">
        <div className="text-sm text-muted-foreground">
          Loading research job...
        </div>
      </Card>
    );
  }
  
  return (
    <Card className="p-4 space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">Background Research</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              This research runs in the background even when you're not on this page.
            </TooltipContent>
          </Tooltip>
        </div>
        
        <div className="flex items-center gap-2">
          {!isCompleted && !isFailed && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePauseResumeJob}
                disabled={isLoading}
              >
                {isPaused ? (
                  <>
                    <PlayIcon className="mr-1 h-4 w-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <PauseIcon className="mr-1 h-4 w-4" />
                    Pause
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCancelJob}
                disabled={isLoading}
              >
                <StopCircleIcon className="mr-1 h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDeleteJob}
            disabled={isLoading}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <div className="text-sm font-medium">
            {isActive && "In progress..."}
            {isPaused && "Paused"}
            {isCompleted && "Completed"}
            {isFailed && "Failed"}
          </div>
          <div className="text-xs text-muted-foreground">
            {job.created_at && format(new Date(job.created_at), 'MMM d, yyyy HH:mm')}
          </div>
        </div>
        
        <Progress 
          value={progressPercent} 
          className="h-2" 
        />
        
        <div className="text-xs text-muted-foreground">
          {progressPercent}% complete
        </div>
      </div>
      
      {progressStrings.length > 0 && (
        <>
          <Separator />
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Progress</h4>
            <ProgressDisplay messages={progressStrings} />
          </div>
        </>
      )}
      
      {job.results && job.results.length > 0 && (
        <>
          <Separator />
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Sources Found</h4>
            <SitePreviewList results={job.results} />
          </div>
        </>
      )}
      
      {job.analysis && (
        <>
          <Separator />
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Analysis</h4>
            <AnalysisDisplay content={job.analysis} />
          </div>
        </>
      )}
      
      {job.insights && (
        <>
          <Separator />
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Insights</h4>
            <InsightsDisplay 
              streamingState={{
                rawText: '',
                parsedData: job.insights
              }} 
            />
          </div>
        </>
      )}
    </Card>
  );
}
