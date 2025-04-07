
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface ResearchStatusBadgeProps {
  status: 'queued' | 'processing' | 'completed' | 'failed' | null;
}

export function ResearchStatusBadge({ status }: ResearchStatusBadgeProps) {
  if (!status) return null;
  
  switch (status) {
    case 'queued':
      return (
        <Badge variant="outline" className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="h-3 w-3" />
          <span>Queued</span>
        </Badge>
      );
    case 'processing':
      return (
        <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Processing</span>
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="outline" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3" />
          <span>Completed</span>
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
          <AlertCircle className="h-3 w-3" />
          <span>Failed</span>
        </Badge>
      );
    default:
      return null;
  }
}
