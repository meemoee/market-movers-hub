
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressDisplay } from "./research/ProgressDisplay";
import { ResearchHeader } from "./research/ResearchHeader";
import { SitePreviewList } from "./research/SitePreviewList";
import { AnalysisDisplay } from "./research/AnalysisDisplay";
import { InsightsDisplay } from "./research/InsightsDisplay";
import { Loader2, Layers, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DeepResearchCardProps {
  marketId: string;
  question: string;
}

interface ResearchResult {
  url: string;
  title?: string;
}

interface ResearchState {
  intent: string;
  iteration: number;
  totalIterations: number;
  currentQuery: string;
  findings: Array<{
    query: string;
    analysis: string;
    keyFindings: string[];
    sources: Array<{url: string; label: string}>;
  }>;
  finalReport?: {
    type: string;
    fullText: string;
  };
}

export function DeepResearchCard({ marketId, question }: DeepResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [researchState, setResearchState] = useState<ResearchState | null>(null);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [analysisContent, setAnalysisContent] = useState<string>("");
  const [expandedFindings, setExpandedFindings] = useState<number[]>([]);
  const [showFinalReport, setShowFinalReport] = useState(false);
  
  // Stream parser for insights
  const [streamingState, setStreamingState] = useState<{
    rawText: string;
    parsedData: {
      probability: string;
      areasForResearch: string[];
    } | null;
  }>({
    rawText: "",
    parsedData: null,
  });

  const handleResearch = useCallback(async () => {
    setIsLoading(true);
    setProgressMessages([]);
    setResults([]);
    setAnalysisContent("");
    setStreamingState({rawText: "", parsedData: null});
    setResearchState(null);
    setExpandedFindings([]);
    setShowFinalReport(false);
    
    try {
      setProgressMessages(prev => [...prev, "Initiating deep research..."]);
      
      // Start deep research process
      const { data, error } = await supabase.functions.invoke("deep-research", {
        body: {
          marketId,
          question,
          iterations: 3,
        },
      });

      if (error) throw error;
      
      setProgressMessages(prev => [...prev, "Research complete!"]);
      
      if (data.state) {
        // Set research state with findings and final report
        setResearchState(data.state);
        
        // Extract sources from all findings for the site preview list
        const allSources = data.state.findings.flatMap(finding => 
          finding.sources.map(source => ({
            url: source.url,
            title: source.label
          }))
        );
        
        setResults(allSources);
        
        // If there's a final report, set it as the analysis content
        if (data.state.finalReport?.fullText) {
          setAnalysisContent(data.state.finalReport.fullText);
        }
        
        // Set initial expanded state to show the first finding
        if (data.state.findings.length > 0) {
          setExpandedFindings([0]);
        }
        
        // Generate insight summary
        generateInsights(data.state);
      }
      
    } catch (error: any) {
      console.error("Deep research error:", error);
      setProgressMessages(prev => [...prev, `Error: ${error.message || "Unknown error"}`]);
    } finally {
      setIsLoading(false);
    }
  }, [marketId, question]);

  const generateInsights = async (state: ResearchState) => {
    setIsAnalyzing(true);
    try {
      setProgressMessages(prev => [...prev, "Analyzing market implications..."]);
      
      // Extract key findings from all research iterations
      const allFindings = state.findings.flatMap(f => f.keyFindings).join("\n");
      
      const { data, error } = await supabase.functions.invoke("extract-research-insights", {
        body: {
          marketId,
          question,
          content: allFindings,
          finalReport: state.finalReport?.fullText || "",
        },
      });

      if (error) throw error;
      
      if (data) {
        setStreamingState({
          rawText: data.rawText || "",
          parsedData: data.parsedData || null,
        });
      }
      
      setProgressMessages(prev => [...prev, "Research insights generated"]);
    } catch (error: any) {
      console.error("Insight generation error:", error);
      setProgressMessages(prev => [...prev, `Error generating insights: ${error.message || "Unknown error"}`]);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const toggleFinding = (index: number) => {
    setExpandedFindings(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };
  
  const toggleFinalReport = () => {
    setShowFinalReport(prev => !prev);
  };

  return (
    <Card className="mb-4 overflow-hidden border-border bg-card/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-base font-medium">
          <Layers className="mr-2 h-5 w-5" />
          Deep Research
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pb-4 space-y-3">
        <ResearchHeader
          isLoading={isLoading}
          isAnalyzing={isAnalyzing}
          onResearch={handleResearch}
        />
        
        <ProgressDisplay messages={progressMessages} />
        
        {/* Display streaming insights */}
        {streamingState.rawText && (
          <InsightsDisplay streamingState={streamingState} />
        )}
        
        {/* Display research findings */}
        {researchState?.findings?.length > 0 && (
          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Research Iterations</h3>
              {researchState.finalReport && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleFinalReport} 
                  className="h-7 px-2 gap-1"
                >
                  {showFinalReport ? "Hide" : "Show"} Final Report
                  {showFinalReport ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              )}
            </div>
            
            {/* Final report section */}
            {showFinalReport && researchState.finalReport && (
              <div className="p-3 bg-accent/5 rounded-lg">
                <h4 className="text-sm font-medium mb-2">Research Synthesis</h4>
                <ScrollArea className="h-[300px]">
                  <div className="prose prose-invert prose-sm max-w-none px-1">
                    <pre className="whitespace-pre-wrap">{researchState.finalReport.fullText}</pre>
                  </div>
                </ScrollArea>
              </div>
            )}
            
            {/* Research iterations */}
            {!showFinalReport && researchState.findings.map((finding, index) => (
              <div key={index} className="p-3 bg-accent/5 rounded-lg">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleFinding(index)}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <h4 className="text-sm font-medium">
                      {finding.query}
                    </h4>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    {expandedFindings.includes(index) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                {expandedFindings.includes(index) && (
                  <div className="mt-3 space-y-3">
                    <div className="text-sm text-muted-foreground">
                      {finding.analysis}
                    </div>
                    
                    {finding.keyFindings.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Key Findings</h5>
                        <ul className="space-y-1 pl-5 list-disc text-sm">
                          {finding.keyFindings.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {finding.sources.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Sources</h5>
                        <ul className="space-y-1">
                          {finding.sources.map((source, i) => (
                            <li key={i} className="text-sm">
                              <a 
                                href={source.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline"
                              >
                                {source.label || source.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Display collected sources */}
        {results.length > 0 && (
          <SitePreviewList results={results} />
        )}
      </CardContent>
    </Card>
  );
}
