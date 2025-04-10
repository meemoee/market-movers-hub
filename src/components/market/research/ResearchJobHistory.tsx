import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, Clock, History } from "lucide-react";
import { ResearchJob } from "@/types/research"; // Import the centralized type

interface ResearchJobHistoryProps {
  jobs: ResearchJob[];
  isLoading: boolean; // Loading state for fetching jobs
  onSelectJob: (job: ResearchJob) => void; // Callback when a job is selected
  disabled?: boolean; // Optional: disable the dropdown trigger
}

// Utility function to format date (consider moving to utils file)
const formatDate = (dateString?: string | null): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch (e) {
    return 'Invalid date';
  }
};

// Utility function to get status icon (consider moving to utils file)
const getStatusIcon = (status: ResearchJob['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin mr-2 flex-shrink-0" />;
    case 'queued':
      return <Clock className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0" />;
    default:
      return null;
  }
};

// Utility function to extract probability (consider moving to utils file)
const extractProbability = (job: ResearchJob): string | null => {
   if (!job.results || job.status !== 'completed') return null;

   try {
     let parsedResults;
     if (typeof job.results === 'string') {
       try {
         parsedResults = JSON.parse(job.results);
       } catch (parseError) {
         console.error('[extractProbability] Error parsing job.results string:', parseError);
         return null;
       }
     } else if (typeof job.results === 'object') {
       parsedResults = job.results;
     } else {
       console.error('[extractProbability] Unexpected results type:', typeof job.results);
       return null;
     }

     if (parsedResults?.structuredInsights?.probability) {
       // Ensure probability is returned as a string, e.g., "75%"
       return String(parsedResults.structuredInsights.probability);
     }
     return null;
   } catch (e) {
     console.error('[extractProbability] Error extracting probability:', e);
     return null;
   }
 };


export function ResearchJobHistory({
  jobs,
  isLoading,
  onSelectJob,
  disabled = false,
}: ResearchJobHistoryProps) {
  if (jobs.length === 0 && !isLoading) {
    return null; // Don't render anything if there's no history and not loading
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || disabled} // Disable if loading jobs or explicitly disabled
          className="flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <History className="h-4 w-4 mr-2" />
          )}
          History ({jobs.length})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px] max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <DropdownMenuItem disabled>Loading history...</DropdownMenuItem>
        ) : jobs.length === 0 ? (
           <DropdownMenuItem disabled>No history found</DropdownMenuItem>
        ) : (
          jobs.map((job) => {
            const probability = extractProbability(job);
            const displayFocus = job.focus_text
              ? job.focus_text.slice(0, 25) + (job.focus_text.length > 25 ? '...' : '')
              : 'General research';

            return (
              <DropdownMenuItem
                key={job.id}
                onClick={() => onSelectJob(job)}
                // Consider adding disabled state if needed, e.g., disabled={isLoadingSelectedJob}
                className="flex flex-col items-start py-2 cursor-pointer"
              >
                <div className="flex items-center w-full">
                  {getStatusIcon(job.status)}
                  <span className="font-medium truncate flex-1" title={job.focus_text || 'General research'}>
                    {displayFocus}
                  </span>
                  <Badge
                    variant="outline"
                    className={`ml-2 text-xs px-1.5 py-0.5 ${
                      job.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                      job.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                      job.status === 'processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}
                  >
                    {job.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between w-full mt-1 pl-6"> {/* Indent details */}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(job.created_at)}
                  </span>
                  {probability && (
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      P: {probability}
                    </Badge>
                  )}
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
