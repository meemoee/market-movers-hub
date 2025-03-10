
import { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Search, Lightbulb, TrendingUp, Check } from 'lucide-react';

interface QueryPattern {
  template: string;
  effectiveness: number;
  occurrences: number;
  examples: string[];
}

interface TemporalPattern {
  period: string;
  common_patterns: string[];
  effectiveness: number;
}

interface QueryPatternAnalyzerProps {
  patterns: QueryPattern[];
  temporalPatterns?: TemporalPattern[];
  className?: string;
}

export function QueryPatternAnalyzer({ 
  patterns,
  temporalPatterns,
  className 
}: QueryPatternAnalyzerProps) {
  // Sort patterns by effectiveness
  const sortedPatterns = useMemo(() => {
    return [...patterns].sort((a, b) => {
      // Sort first by effectiveness, then by occurrences
      if (b.effectiveness !== a.effectiveness) {
        return b.effectiveness - a.effectiveness;
      }
      return b.occurrences - a.occurrences;
    });
  }, [patterns]);
  
  const getEffectivenessColor = (score: number) => {
    if (score >= 7) return "text-green-500";
    if (score >= 4) return "text-amber-500";
    return "text-red-500";
  };

  if (!patterns.length) {
    return null;
  }

  return (
    <Card className={`p-4 ${className || ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="h-5 w-5 text-amber-500" />
        <h3 className="text-base font-semibold">Query Pattern Analysis</h3>
      </div>
      
      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-4">
          {sortedPatterns.map((pattern, index) => (
            <div key={index} className="border border-accent/30 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium flex items-center gap-1">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  Pattern Template
                </div>
                <Badge variant="outline" className="ml-auto">
                  {pattern.occurrences} {pattern.occurrences === 1 ? 'occurrence' : 'occurrences'}
                </Badge>
              </div>
              
              <div className="bg-accent/10 p-2 rounded mb-2 text-sm font-mono">
                {pattern.template}
              </div>
              
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs">Effectiveness:</span>
                <span className={`text-sm font-medium ${getEffectivenessColor(pattern.effectiveness)}`}>
                  {pattern.effectiveness.toFixed(1)}/10
                </span>
              </div>
              
              {pattern.examples.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1">Example Queries:</div>
                  <div className="space-y-1">
                    {pattern.examples.slice(0, 3).map((example, i) => (
                      <div key={i} className="text-xs text-muted-foreground pl-2 flex items-start">
                        <ArrowRight className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                        <span>{example}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {temporalPatterns && temporalPatterns.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2 flex items-center gap-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Temporal Query Patterns
              </div>
              
              {temporalPatterns.map((tp, index) => (
                <div key={index} className="border border-accent/20 rounded-md p-2 mb-2">
                  <div className="text-xs font-medium">{tp.period}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-muted-foreground">Effectiveness:</span>
                    <span className={`text-xs ${getEffectivenessColor(tp.effectiveness)}`}>
                      {tp.effectiveness.toFixed(1)}/10
                    </span>
                  </div>
                  
                  <div className="mt-1">
                    {tp.common_patterns.map((pattern, i) => (
                      <div key={i} className="text-xs pl-2 flex items-start mt-1">
                        <Check className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">{pattern}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
