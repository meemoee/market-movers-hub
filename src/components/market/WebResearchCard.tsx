import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ProgressDisplay } from "./research/ProgressDisplay";
import { ResearchHeader } from "./research/ResearchHeader";
import { IterationCard } from "./research/IterationCard";
import { InsightsDisplay } from "./research/InsightsDisplay";
import { ResearchIteration, ResearchMarket, ResearchInsights } from "@/types";
import { v4 as uuidv4 } from 'uuid';
import { supabase } from "@/integrations/supabase/client";

export interface WebResearchCardProps {
  market: ResearchMarket;
  onSave?: (market: ResearchMarket) => Promise<void>;
}

export function WebResearchCard({ market, onSave }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [focusText, setFocusText] = useState(market?.focus_text || "");
  const [description, setDescription] = useState(market?.description || "");
  const [messages, setMessages] = useState<string[]>([]);
  const [queryList, setQueryList] = useState<string[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [maxIterations, setMaxIterations] = useState(3);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [iterations, setIterations] = useState<ResearchIteration[]>([]);
  const [expandedIterations, setExpandedIterations] = useState<string[]>([]);
  const [insights, setInsights] = useState<ResearchInsights | null>(null);
  const [currentSubject, setCurrentSubject] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (market) {
      setFocusText(market.focus_text || "");
      setDescription(market.description || "");
    }
  }, [market]);

  const toggleIterationExpand = (id: string) => {
    setExpandedIterations(prev => {
      if (prev.includes(id)) {
        return prev.filter(iterationId => iterationId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSave = async () => {
    if (!market) return;

    setSaveStatus('saving');
    try {
      if (onSave) {
        await onSave({
          ...market,
          focus_text: focusText,
          description: description,
        });
        setSaveStatus('success');
        toast({
          title: "Market Saved",
          description: "This market's research settings have been saved.",
        });
      } else {
        console.log("No onSave function provided");
        setSaveStatus('idle');
      }
    } catch (error) {
      console.error("Error saving market:", error);
      setSaveStatus('error');
      toast({
        title: "Error Saving Market",
        description: "There was an error saving this market's research settings.",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    }
  };

  const runWebResearch = useCallback(async (researchQuery: string, researchFocusText?: string) => {
    if (!market) {
      console.error("Market is null or undefined");
      return;
    }

    if (!researchQuery) {
      console.warn("Research query is empty");
      return;
    }

    setIsAnalyzing(true);
    setMessages([]);
    setIterations([]);
    setInsights(null);

    try {
      const { data, error } = await supabase.functions.invoke('web-scrape', {
        body: {
          query: researchQuery,
          focusText: researchFocusText,
        },
      });

      if (error) {
        console.error("Error running web research:", error);
        toast({
          title: "Research Failed",
          description: error.message || "Failed to perform web research",
          variant: "destructive",
        });
        setIsAnalyzing(false);
        return;
      }

      if (data && Array.isArray(data)) {
        const sitesFound = data.length;
        const newIteration: ResearchIteration = {
          id: uuidv4(),
          iteration: currentIteration,
          query: researchQuery,
          sites: data,
          sitesFound: sitesFound,
          analysis: 'Analysis complete',
        };
        
        setIterations(prev => [...prev, newIteration]);
        setMessages(prev => [...prev, `Found ${sitesFound} sites for query "${researchQuery}"`]);
        setIsAnalyzing(false);
        setIsComplete(true);
        
        toast({
          title: "Research Complete",
          description: "Web research completed successfully!",
        });
      }
    } catch (error) {
      console.error("Error in web research:", error);
      setIsAnalyzing(false);
      toast({
        title: "Research Failed",
        description: "An error occurred during web research",
        variant: "destructive",
      });
    }
  }, [market, toast, currentIteration]);

  const startDeepResearch = useCallback(async () => {
    if (!market) {
      console.error("Market is null or undefined");
      return;
    }

    if (!description) {
      console.warn("Market description is empty");
      return;
    }

    setIsLoading(true);
    setResearchStep("initial");
    setMessages(["Starting deep research..."]);
    setCurrentSubject(focusText || "");
    setIsComplete(false);
    setSaveStatus("idle");
    setIterations([]);
    setInsights(null);

    try {
      const { data, error } = await supabase.functions.invoke('deep-research', {
        body: {
          description: description,
          marketId: market.id,
          iterations: maxIterations,
        },
      });

      if (error) {
        console.error("Deep research error:", error);
        setMessages(prev => [...prev, `Error: ${error.message}`]);
        toast({
          title: "Deep Research Failed",
          description: error.message || "Failed to perform deep research",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (data?.report) {
        setMessages(prev => [...prev, "Research report generated successfully!"]);
        setInsights({
          areasForResearch: data.report.keyFindings || [],
          supportingPoints: data.report.keyFindings || [],
          negativePoints: data.report.keyFindings || [],
          reasoning: data.report.analysis || "No analysis available",
          probability: data.report.conclusion || "No conclusion available",
        });
      }

      if (data?.steps) {
        const newIterations = data.steps.map((step: any, index: number) => ({
          id: uuidv4(),
          iteration: index + 1,
          query: step.query,
          sites: [],
          sitesFound: 0,
          analysis: step.results,
        }));
        setIterations(newIterations);
      }

      setIsLoading(false);
      setIsComplete(true);
    } catch (error) {
      console.error("Error in deep research:", error);
      toast({
        title: "Deep Research Error",
        description: "An unexpected error occurred during deep research",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [market, description, maxIterations, focusText, toast]);

  const [researchStep, setResearchStep] = useState<
    "initial" | "query" | "research" | "analysis" | "complete"
  >("initial");

  const startWebResearch = async () => {
    if (!market) {
      console.error("Market is null or undefined");
      return;
    }

    if (!description) {
      console.warn("Market description is empty");
      return;
    }

    try {
      setIsLoading(true);
      setResearchStep("initial");
      setMessages(["Starting web research..."]);
      setCurrentSubject(focusText || "");
      setIsComplete(false);
      setSaveStatus("idle");

      let queries: string[] = [];
      const generateParams = {
        query: description || "No description available",
        marketPrice: market?.price,
        marketQuestion: market?.question,
        focusText: focusText || null,
        iteration: 1
      };
      
      console.log("Sending query generation request with params:", generateParams);

      try {
        const { data: queriesResponse, error: queriesError } = await supabase.functions.invoke('generate-queries', {
          body: generateParams
        });

        if (queriesError) {
          console.error("Query generation error:", queriesError);
          setMessages(prev => [...prev, `Error generating queries: ${queriesError.message}`]);
          throw new Error(`Failed to generate research queries: ${queriesError.message}`);
        }

        if (!queriesResponse?.queries || !Array.isArray(queriesResponse.queries) || queriesResponse.queries.length === 0) {
          console.error("Invalid queries response:", queriesResponse);
          throw new Error("Failed to generate valid research queries");
        }

        queries = queriesResponse.queries;
        console.log("Successfully generated queries:", queries);
        setMessages(prev => [...prev, `Generated ${queries.length} search queries for research...`]);
      } catch (error) {
        console.error("Error in query generation:", error);
        toast({
          title: "Query Generation Failed",
          description: error.message || "Failed to generate research queries",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      setQueryList(queries);
      setMaxIterations(queries.length);
      setCurrentIteration(1);
      setResearchStep("query");

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        setCurrentIndex(i);
        setCurrentQuery(query);
        setProgress((i + 1) / queries.length);
        setResearchStep("research");

        try {
          await runWebResearch(query, focusText);
          setMessages(prev => [...prev, `Completed research iteration ${i + 1} of ${queries.length}`]);
        } catch (researchError) {
          console.error(`Error running web research for query "${query}":`, researchError);
          setMessages(prev => [...prev, `Error running research for query "${query}": ${researchError.message}`]);
          toast({
            title: "Research Iteration Failed",
            description: `Failed to complete research for query "${query}": ${researchError.message}`,
            variant: "destructive"
          });
        }

        setCurrentIteration(i + 2);
      }

      setResearchStep("analysis");
      setIsLoading(false);
      setIsComplete(true);
      setMessages(prev => [...prev, "Web research completed!"]);
      toast({
        title: "Research Complete",
        description: "Web research completed successfully!",
      });
    } catch (error) {
      console.error("Error in startWebResearch:", error);
      toast({
        title: "Web Research Failed",
        description: error.message || "An unexpected error occurred during web research",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="space-y-4">
        <ResearchHeader
          isLoading={isLoading}
          isAnalyzing={isAnalyzing}
          onResearch={startWebResearch}
          focusText={focusText}
          description={description}
          marketPrice={market?.price}
          marketId={market?.id}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="focus-text">Focus Text</Label>
            <Input
              id="focus-text"
              placeholder="e.g. AI, Climate Change"
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="market-description">Market Description</Label>
            <Textarea
              id="market-description"
              placeholder="e.g. Will AI lead to a significant decrease in employment rates by 2030?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={handleSave} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving...' : 'Save'}
          </Button>
          <Button onClick={startDeepResearch} disabled={isLoading || isAnalyzing}>
            {isLoading ? 'Loading...' : 'Start Deep Research'}
          </Button>
        </div>

        <ProgressDisplay
          messages={messages}
          currentIteration={currentIteration}
          maxIterations={maxIterations}
          currentQueryIndex={currentIndex}
          queries={queryList}
          isLoading={isLoading}
          currentProgress={progress}
          currentQuery={currentQuery}
        />

        {iterations.map((iteration, idx) => (
          <IterationCard
            key={`${iteration.id}-${idx}`}
            iteration={iteration}
            isExpanded={expandedIterations.includes(iteration.id)}
            onToggle={() => toggleIterationExpand(iteration.id)}
            onToggleExpand={() => toggleIterationExpand(iteration.id)}
          />
        ))}

        {insights && (
          <InsightsDisplay
            areasForResearch={insights.areasForResearch}
            supportingPoints={insights.supportingPoints}
            negativePoints={insights.negativePoints}
            reasoning={insights.reasoning}
            probability={insights.probability}
          />
        )}
      </CardContent>
    </Card>
  );
}
