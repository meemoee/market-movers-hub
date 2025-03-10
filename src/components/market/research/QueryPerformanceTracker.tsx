
import React, { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Target, Search } from 'lucide-react';
import { cn } from "@/lib/utils";

interface QueryPerformance {
  query: string;
  effectiveness: number;
  resultCount: number;
  iterationIndex: number;
  focusArea?: string;
  timestamp?: string;
}

interface QueryPerformanceTrackerProps {
  queries: QueryPerformance[];
  className?: string;
}

export function QueryPerformanceTracker({ 
  queries,
  className
}: QueryPerformanceTrackerProps) {
  // Group queries by iteration
  const queriesByIteration = useMemo(() => {
    const grouped: Record<number, QueryPerformance[]> = {};
    
    queries.forEach(query => {
      if (!grouped[query.iterationIndex]) {
        grouped[query.iterationIndex] = [];
      }
      grouped[query.iterationIndex].push(query);
    });
    
    return grouped;
  }, [queries]);
  
  // Calculate average effectiveness per iteration
  const iterationEffectiveness = useMemo(() => {
    const result: { iteration: number; avgEffectiveness: number }[] = [];
    
    Object.entries(queriesByIteration).forEach(([iterIndex, iterQueries]) => {
      const iteration = parseInt(iterIndex);
      const total = iterQueries.reduce((sum, q) => sum + q.effectiveness, 0);
      const avg = total / iterQueries.length;
      
      result.push({ iteration, avgEffectiveness: avg });
    });
    
    return result.sort((a, b) => a.iteration - b.iteration);
  }, [queriesByIteration]);
  
  // Get most effective queries
  const topQueries = useMemo(() => {
    return [...queries]
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 3);
  }, [queries]);
  
  const getColorClass = (score: number) => {
    if (score >= 7) return "bg-green-500";
    if (score >= 4) return "bg-amber-500";
    return "bg-red-500";
  };

  if (!queries.length) {
    return null;
  }

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Query Performance Metrics</h3>
      </div>
      
      {/* Iteration Effectiveness */}
      <div className="space-y-3 mb-6">
        <h4 className="text-sm font-medium">Effectiveness by Iteration</h4>
        {iterationEffectiveness.map(({ iteration, avgEffectiveness }) => (
          <div key={iteration} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-24">Iteration {iteration}</span>
            <div className="flex-1">
              <Progress 
                value={avgEffectiveness * 10} 
                className="h-2"
              />
            </div>
            <span className="text-xs">{avgEffectiveness.toFixed(1)}/10</span>
          </div>
        ))}
      </div>
      
      {/* Top Performing Queries */}
      <div>
        <h4 className="text-sm font-medium mb-2">Most Effective Queries</h4>
        <div className="space-y-2">
          {topQueries.map((query, index) => (
            <div key={index} className="bg-accent/10 p-2 rounded-md">
              <div className="flex items-center gap-2">
                <Search className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs truncate flex-1">{query.query}</span>
                <Badge className={cn(
                  "ml-auto",
                  query.effectiveness >= 7 ? "bg-green-500/20 text-green-700 hover:bg-green-500/20" : 
                  query.effectiveness >= 4 ? "bg-amber-500/20 text-amber-700 hover:bg-amber-500/20" : 
                  "bg-red-500/20 text-red-700 hover:bg-red-500/20"
                )}>
                  {query.effectiveness.toFixed(1)}/10
                </Badge>
              </div>
              
              {query.focusArea && (
                <div className="flex items-center gap-1 mt-1">
                  <Target className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">{query.focusArea}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
