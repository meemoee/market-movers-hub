
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnalysisDisplay } from "../AnalysisDisplay"
import { SourcesTabContent } from "./SourcesTabContent"
import { QueriesTabContent } from "./QueriesTabContent"
import { ResearchResult } from "../SitePreviewList"

interface IterationCardContentProps {
  analysis: string;
  reasoning?: string;
  results: ResearchResult[];
  queries: string[];
  isAnalysisStreaming: boolean;
  isReasoningStreaming: boolean;
}

export function IterationCardContent({
  analysis,
  reasoning,
  results,
  queries,
  isAnalysisStreaming,
  isReasoningStreaming
}: IterationCardContentProps) {
  const [activeTab, setActiveTab] = useState<string>("analysis")
  
  return (
    <div className="p-3 w-full max-w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-full">
        <TabsList className="w-full grid grid-cols-3 mb-3">
          <TabsTrigger value="analysis" className="text-xs">Analysis</TabsTrigger>
          <TabsTrigger value="sources" className="text-xs">Sources ({results.length})</TabsTrigger>
          <TabsTrigger value="queries" className="text-xs">Queries ({queries.length})</TabsTrigger>
        </TabsList>
        
        <div className="tab-content-container h-[200px] w-full">
          <TabsContent value="analysis" className="w-full max-w-full h-full m-0 p-0">
            <AnalysisDisplay 
              content={analysis || "Analysis in progress..."} 
              reasoning={reasoning}
              isStreaming={isAnalysisStreaming}
              isReasoningStreaming={isReasoningStreaming}
              maxHeight="100%"
            />
          </TabsContent>
          
          <TabsContent value="sources" className="w-full max-w-full h-full m-0 p-0">
            <SourcesTabContent results={results} />
          </TabsContent>
          
          <TabsContent value="queries" className="w-full max-w-full h-full m-0 p-0">
            <QueriesTabContent queries={queries} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
