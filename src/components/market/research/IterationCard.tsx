
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResearchIteration } from "@/types";

export interface IterationCardProps {
  iteration: ResearchIteration;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
}

export function IterationCard({ iteration, isExpanded, onToggle, onToggleExpand }: IterationCardProps) {
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());

  const toggleSite = (siteId: string) => {
    setExpandedSites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteId)) {
        newSet.delete(siteId);
      } else {
        newSet.add(siteId);
      }
      return newSet;
    });
  };

  return (
    <Card className={cn(
      "w-full transition-all duration-300 overflow-hidden",
      isExpanded ? "max-h-[2000px]" : "max-h-32"
    )}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base font-medium">
            Iteration {iteration.iteration}: {iteration.query}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onToggleExpand} className="h-8 w-8 p-0">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <CardDescription className="text-xs">
          {iteration.sitesFound} sources found
        </CardDescription>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pb-2">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Sources:</h4>
              <div className="space-y-2">
                {iteration.sites?.map((site, idx) => (
                  <div key={`${site.url}-${idx}`} className="border rounded-md overflow-hidden">
                    <div 
                      className="flex justify-between items-center p-2 bg-muted/30 cursor-pointer"
                      onClick={() => toggleSite(site.url)}
                    >
                      <div className="text-xs font-medium truncate flex-1">{site.title || site.url}</div>
                      <a 
                        href={site.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ml-2 text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {expandedSites.has(site.url) && (
                      <div className="p-2 text-xs bg-card/50">
                        {site.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {iteration.analysis && (
              <div>
                <h4 className="text-sm font-medium mb-2">Analysis:</h4>
                <div className="text-xs">{iteration.analysis}</div>
              </div>
            )}
          </div>
        </CardContent>
      )}

      <CardFooter className={cn("pt-0", isExpanded ? "" : "absolute bottom-0 right-0")}>
        {!isExpanded && (
          <Button variant="ghost" size="sm" onClick={onToggle} className="ml-auto">
            Show details
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
