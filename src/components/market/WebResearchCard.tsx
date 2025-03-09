import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ResearchHeader } from "@/components/market/research/ResearchHeader"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { QADisplay } from "@/components/market/QADisplay";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface WebResearchCardProps {
  marketId: string;
  marketQuestion: string;
  marketDescription?: string;
}

interface Site {
  url: string;
  title: string;
  content: string;
}

interface Insight {
  text: string;
  sources: string[];
}

export function WebResearchCard({ marketId, marketQuestion, marketDescription }: WebResearchCardProps) {
  const { toast } = useToast()
  const [query, setQuery] = useState(marketQuestion);
  const [focusText, setFocusText] = useState<string | null>(null);
  const [parentFocusText, setParentFocusText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [focusInsights, setFocusInsights] = useState<Insight[]>([]);
  const [progress, setProgress] = useState<number[]>([]);
  const [currentQueries, setCurrentQueries] = useState<string[]>([]);
  const [currentQueryIndex, setCurrentQueryIndex] = useState(-1);
	const [previousResearchContext, setPreviousResearchContext] = useState<any | null>(null);

  const handleResearch = useCallback(async () => {
    if (!marketId) {
      toast({
        variant: "destructive",
        title: "Missing Market ID",
        description: "Please provide a valid market ID.",
      })
      return;
    }

    if (!query) {
      toast({
        variant: "destructive",
        title: "Missing Market Question",
        description: "Please provide a valid market question.",
      })
      return;
    }

    setIsResearching(true);
    setIsAnalyzing(false);
    setSites([]);
    setFocusInsights([]);
    setProgress([]);
    setCurrentQueries([]);
    setCurrentQueryIndex(-1);

    const scrapePayload = {
      query,
      num_pages: 2,
      chunk_size: 1500,
    };

    try {
      const { data, error } = await supabase.functions.invoke('web-research', {
        body: {
          ...scrapePayload,
          marketId,
          query: marketQuestion,
          focusText: focusText?.trim(),
          parentFocusText: parentFocusText?.trim()
        },
      });

      if (error) {
        console.error("Supabase function error:", error);
        toast({
          variant: "destructive",
          title: "Research Failed",
          description: error.message || "Failed to start research.",
        });
        setIsResearching(false);
        return;
      }

      if (data && data.error) {
        console.error("Function returned error:", data.error);
        toast({
          variant: "destructive",
          title: "Research Failed",
          description: data.error || "Research process encountered an error.",
        });
        setIsResearching(false);
        return;
      }

      if (data && data.queries) {
        setCurrentQueries(data.queries);
        setCurrentQueryIndex(0);
        setIsLoading(true);
      } else {
        console.warn("No queries returned from function.");
        toast({
          variant: "warning",
          title: "No Queries",
          description: "No search queries were generated. Please try again.",
        });
        setIsResearching(false);
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      toast({
        variant: "destructive",
        title: "Unexpected Error",
        description: err.message || "An unexpected error occurred.",
      });
      setIsResearching(false);
    }
  }, [marketId, marketQuestion, query, toast, focusText, parentFocusText]);

  useEffect(() => {
    async function streamData() {
      if (!isLoading || currentQueryIndex < 0 || currentQueryIndex >= currentQueries.length) {
        return;
      }

      const currentQuery = currentQueries[currentQueryIndex];
      if (!currentQuery) {
        console.warn("No current query to process.");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('scrape-and-analyze', {
          body: {
            query: currentQuery,
            marketId,
            focusText: focusText?.trim(),
						previousResearchContext,
          },
        });

        if (error) {
          console.error("Stream error:", error);
          toast({
            variant: "destructive",
            title: "Stream Error",
            description: error.message || "Failed to stream data.",
          });
          setIsLoading(false);
          setIsResearching(false);
          return;
        }

        if (data && data.error) {
          console.error("Stream returned error:", data.error);
          toast({
            variant: "destructive",
            title: "Stream Error",
            description: data.error || "Stream encountered an error.",
          });
          setIsLoading(false);
          setIsResearching(false);
          return;
        }

        if (data && data.sites) {
          const newSites = data.sites.map((site: any) => ({
            url: site.url,
            title: site.title,
            content: site.content,
          }));
          setSites(prevSites => [...prevSites, ...newSites]);
        }

        if (data && data.insights) {
          const newInsights = data.insights.map((insight: any) => ({
            text: insight.text,
            sources: insight.sources,
          }));
          setFocusInsights(prevInsights => [...prevInsights, ...newInsights]);
        }

        setProgress(prevProgress => [...prevProgress, 100]);

        if (currentQueryIndex < currentQueries.length - 1) {
          setCurrentQueryIndex(currentQueryIndex + 1);
        } else {
          setIsLoading(false);
          setIsResearching(false);
          setIsAnalyzing(true);
          toast({
            title: "Research Complete",
            description: "All data streams processed.",
          });
        }
      } catch (err: any) {
        console.error("Unexpected stream error:", err);
        toast({
          variant: "destructive",
          title: "Unexpected Stream Error",
          description: err.message || "An unexpected error occurred during streaming.",
        });
        setIsLoading(false);
        setIsResearching(false);
      }
    }

    streamData();
  }, [currentQueryIndex, currentQueries, isLoading, marketId, toast, focusText, previousResearchContext]);

  const startFocusedResearch = (text: string) => {
    if (!text.trim()) return;
    
    setFocusText(text.trim());
    setIsLoading(false);
    setIsResearching(false);
    setIsAnalyzing(false);
    setSites([]);
    setFocusInsights([]);
    setProgress([]);
    setCurrentQueries([]);
    setCurrentQueryIndex(-1);
    
    // Set the previous focus as parent for nested research
    // This is what we're adding - track the current focus as parent when nesting
    const currentParent = focusText || null;
    setParentFocusText(currentParent);
    
    // Reset previous research context to avoid contamination
    setPreviousResearchContext(null);
    
    setTimeout(() => {
      handleResearch();
    }, 200);
  };

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Web Research</CardTitle>
        <CardDescription>Gather insights from the web.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="question">Question</Label>
          <Input
            id="question"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to research?"
          />
        </div>

        <ResearchHeader 
          isLoading={isLoading} 
          isAnalyzing={isAnalyzing} 
          onResearch={handleResearch}
          focusText={focusText}
		  parentFocusText={parentFocusText}
        />

        {currentQueries.map((q, i) => (
          <div key={i} className="mb-2">
            <div className="text-sm font-medium">Query {i + 1}: {q}</div>
            <Progress value={progress[i] || 0} />
          </div>
        ))}

        {focusInsights.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="grid gap-2">
              <Label>Key Insights</Label>
              <ScrollArea className="h-[300px] w-full rounded-md border">
                <div className="p-4">
                  {focusInsights.map((insight, i) => (
                    <div key={i} className="mb-4">
                      <p className="text-sm">{insight.text}</p>
                      <div className="mt-2">
                        {insight.sources.map((source, j) => (
                          <Badge key={j} variant="secondary" className="mr-1">
                            <a href={source} target="_blank" rel="noopener noreferrer">
                              Source {j + 1}
                            </a>
                          </Badge>
                        ))}
                      </div>
                      {i < focusInsights.length - 1 && <Separator className="my-4" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <div>
          {sites.length > 0 && (
            <Button variant="secondary">
              <a href={sites[0].url} target="_blank" rel="noopener noreferrer">
                First Site
              </a>
            </Button>
          )}
        </div>
        <div>
          {isLoading ? (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Researching...
            </Button>
          ) : (
            isAnalyzing ? (
              <Button disabled>Analyzing...</Button>
            ) : (
              isResearching ? (
                <Button disabled>Researching...</Button>
              ) : (
                <Button onClick={handleResearch}>Start Research</Button>
              )
            )
          )}
        </div>
      </CardFooter>
      {isAnalyzing && (
        <QADisplay marketId={marketId} marketQuestion={marketQuestion} marketDescription={marketDescription} />
      )}
      {sites.length > 0 && (
        <div className="mt-4">
          <Label>Explore Further:</Label>
          <ScrollArea className="h-[200px] w-full rounded-md border mt-2">
            <div className="p-4">
              {sites.map((site, i) => (
                <div key={i} className="mb-4">
                  <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    {site.title}
                  </a>
                  <p className="text-sm mt-1">{site.content.substring(0, 150)}...</p>
                  <Button variant="outline" size="sm" onClick={() => startFocusedResearch(site.title)}>
                    Focus on this
                  </Button>
                  {i < sites.length - 1 && <Separator className="my-4" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </Card>
  )
}
