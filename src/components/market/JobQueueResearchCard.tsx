import { useState, useEffect, useRef } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/integrations/supabase/client"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { useToast } from "@/components/ui/use-toast"
import { SSEMessage } from "supabase/functions/web-scrape/types"
import { IterationCard } from "./research/IterationCard"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle, AlertCircle, Clock, History, Mail, Settings } from "lucide-react"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
  bestBid?: number;
  bestAsk?: number;
  noBestAsk?: number; 
  noBestBid?: number;
  outcomes?: string[];
}

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: any[];
  results: any;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
  user_id?: string;
  focus_text?: string;
  notification_email?: string;
  notification_sent?: boolean;
}

export function JobQueueResearchCard({ 
  description, 
  marketId, 
  bestBid, 
  bestAsk, 
  noBestAsk,
  noBestBid,
  outcomes 
}: JobQueueResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [progressPercent, setProgressPercent] = useState<number>(0)
  const [results, setResults] = useState<ResearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [iterations, setIterations] = useState<any[]>([])
  const [expandedIterations, setExpandedIterations] = useState<number[]>([])
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null)
  const [structuredInsights, setStructuredInsights] = useState<any>(null)
  const [focusText, setFocusText] = useState<string>('')
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [notifyByEmail, setNotifyByEmail] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [maxIterations, setMaxIterations] = useState<string>("3")
  const [streamingIterations, setStreamingIterations] = useState<Set<number>>(new Set())
  const realtimeChannelRef = useRef<any>(null)
  const { toast } = useToast()

  useEffect(() => {
    const loadJobData = async () => {
      if (jobId) {
        const { data: job } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('id', jobId)
          .single()

        if (job) {
          if (job.status === 'completed' && job.results) {
            try {
              let parsedResults;
              if (typeof job.results === 'string') {
                try {
                  parsedResults = JSON.parse(job.results);
                } catch (parseError) {
                  console.error('Error parsing job.results string in loadJobData:', parseError);
                  throw new Error('Invalid results format (string parsing failed)');
                }
              } else if (typeof job.results === 'object') {
                parsedResults = job.results;
              } else {
                throw new Error(`Unexpected results type: ${typeof job.results}`);
              }
              
              if (parsedResults.data && Array.isArray(parsedResults.data)) {
                setResults(parsedResults.data);
              }
              if (parsedResults.analysis) {
                setAnalysis(parsedResults.analysis);
              }
              if (parsedResults.structuredInsights) {
                console.log('Found structuredInsights in loadJobData:', parsedResults.structuredInsights);
                
                const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
                  calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
                  null;
                
                setStructuredInsights({
                  rawText: typeof parsedResults.structuredInsights === 'string' 
                    ? parsedResults.structuredInsights 
                    : JSON.stringify(parsedResults.structuredInsights),
                  parsedData: {
                    ...parsedResults.structuredInsights,
                    goodBuyOpportunities
                  }
                });
              }
            } catch (e) {
              console.error('Error processing loaded job results:', e);
            }
          }
        }
      }
    }

    loadJobData()
  }, [jobId])

  {analysis && (
    <div className="border-t pt-4 w-full max-w-full">
      <AnalysisDisplay content={analysis} />
    </div>
  )}
  
  {structuredInsights && (
    <div className="border-t pt-4 w-full max-w-full">
      <InsightsDisplay streamingState={structuredInsights} />
    </div>
  )}

  {iterations.length > 0 && (
    <div className="border-t pt-4 w-full max-w-full space-y-2">
      <h3 className="text-lg font-medium mb-2">Research Iterations</h3>
      <div className="space-y-2">
        {iterations.map((iteration) => (
          <IterationCard
            key={iteration.iteration}
            iteration={iteration}
            isExpanded={expandedIterations.includes(iteration.iteration)}
            onToggleExpand={() => toggleIterationExpand(iteration.iteration)}
            isStreaming={streamingIterations.has(iteration.iteration)}
            isCurrentIteration={iteration.iteration === (iterations.length > 0 ? Math.max(...iterations.map(i => i.iteration)) : 0)}
            isFinalIteration={iteration.iteration === parseInt(maxIterations, 10)}
          />
        ))}
      </div>
    </div>
  )}

  {results.length > 0 && (
    <div className="border-t pt-4 w-full max-w-full">
      <SitePreviewList results={results} />
    </div>
  )}
}
