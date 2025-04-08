
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, Clock, History } from "lucide-react";
import { ResearchJob } from "@/types/research";

interface ResearchHistoryProps {
  jobs: ResearchJob[];
  isLoading: boolean;
  onLoadJob: (jobId: string) => void;
  extractProbability: (job: ResearchJob) => string | null;
}

export function ResearchHistory({ jobs, isLoading, onLoadJob, extractProbability }: ResearchHistoryProps) {
  if (jobs.length === 0) return null;

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(date);
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500 mr-2" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500 mr-2" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin mr-2" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500 mr-2" />;
      default:
        return null;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          disabled={isLoading}
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
        {jobs.map((job) => {
          const probability = extractProbability(job);
          
          return (
            <DropdownMenuItem
              key={job.id}
              onClick={() => onLoadJob(job.id)}
              disabled={isLoading}
              className="flex flex-col items-start py-2"
            >
              <div className="flex items-center w-full">
                {getStatusIcon(job.status)}
                <span className="font-medium truncate flex-1">
                  {job.focus_text ? job.focus_text.slice(0, 20) + (job.focus_text.length > 20 ? '...' : '') : 'General research'}
                </span>
                <Badge 
                  variant="outline" 
                  className={`ml-2 ${
                    job.status === 'completed' ? 'bg-green-50 text-green-700' : 
                    job.status === 'failed' ? 'bg-red-50 text-red-700' :
                    job.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                    'bg-yellow-50 text-yellow-700'
                  }`}
                >
                  {job.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between w-full mt-1">
                <span className="text-xs text-muted-foreground">
                  {formatDate(job.created_at)}
                </span>
                {probability && (
                  <Badge variant="secondary" className="text-xs">
                    P: {probability}
                  </Badge>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
