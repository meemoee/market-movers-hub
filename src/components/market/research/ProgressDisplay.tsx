
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, CheckCircle, CircleAlert, Hourglass } from "lucide-react";

export interface ProgressDisplayProps {
  messages: string[];
  isLoading: boolean;
  currentIteration: number;
  maxIterations: number;
  currentQueryIndex: number;
  queries: string[];
  currentProgress: number;
  currentQuery: string | null;
}

export function ProgressDisplay({
  messages,
  isLoading,
  currentIteration,
  maxIterations,
  currentQueryIndex,
  queries,
  currentProgress,
  currentQuery
}: ProgressDisplayProps) {
  const formatProgress = (current: number, max: number) => {
    return `${current} / ${max}`;
  };

  if (messages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Research Progress</h3>
          {isLoading && (
            <div className="flex items-center gap-2 text-xs">
              <Hourglass className="h-3 w-3 animate-spin text-primary" />
              <span>
                {formatProgress(currentIteration, maxIterations)} iterations
              </span>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{Math.round(currentProgress * 100)}%</span>
            </div>
            <Progress value={currentProgress * 100} />
            
            {currentQuery && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <ArrowRight className="h-3 w-3" />
                <span>Current query: {currentQuery}</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 max-h-40 overflow-y-auto text-xs">
          {messages.map((message, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-muted-foreground"
            >
              {message.toLowerCase().includes("error") ? (
                <CircleAlert className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
              ) : message.toLowerCase().includes("complete") ? (
                <CheckCircle className="h-3 w-3 text-primary mt-0.5 shrink-0" />
              ) : (
                <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
              )}
              <span>{message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
