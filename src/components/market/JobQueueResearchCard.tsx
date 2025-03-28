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
import { IterationCard } from "./research/iteration-card/IterationCard"
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
  const [researchJob, setResearchJob] = useState<ResearchJob | null>(null);
  const [query, setQuery] = useState(description);
  const [isProcessing, setIsProcessing] = useState(false);
  const [iterations, setIterations] = useState<any[]>([]);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [maxIterations, setMaxIterations] = useState<number>(3);
  const [focusText, setFocusText] = useState<string>('');
	const [notificationEmail, setNotificationEmail] = useState<string>('');
  const [isEmailNotificationEnabled, setIsEmailNotificationEnabled] = useState(false);
  const [isInsightsExpanded, setIsInsightsExpanded] = useState(false);
  const [selectedInsightType, setSelectedInsightType] = useState<'analysis' | 'probability' | 'areas'>('analysis');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const { toast } = useToast();
  const sseClient = useRef<EventSource | null>(null);

  const userId = supabase.auth.user()?.id;

  const fetchExistingJob = async () => {
    if (!marketId) return;

    try {
      const { data: existingJob, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('market_id', marketId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching existing research job:", error);
        return;
      }

      if (existingJob) {
        setResearchJob(existingJob);
        setQuery(existingJob.query);
        setIsProcessing(existingJob.status === 'processing' || existingJob.status === 'queued');
        setIterations(existingJob.iterations || []);
        setResults(existingJob.results || []);
        setProgressLog(existingJob.progress_log || []);
        setErrorMessage(existingJob.error_message || null);
        setMaxIterations(existingJob.max_iterations);
        setFocusText(existingJob.focus_text || '');
				setNotificationEmail(existingJob.notification_email || '');
        setIsEmailNotificationEnabled(!!existingJob.notification_email);
      }
    } catch (error) {
      console.error("Error fetching research job:", error);
    }
  };

  useEffect(() => {
    fetchExistingJob();
  }, [marketId, userId]);

  useEffect(() => {
    if (researchJob?.id && isProcessing) {
      startSSEStream(researchJob.id);
    }

    return () => {
      if (sseClient.current) {
        sseClient.current.close();
      }
    };
  }, [researchJob?.id, isProcessing]);

  const startResearch = async () => {
    if (!query || !marketId) {
      toast({
        title: "Missing Input",
        description: "Please enter a query and ensure the market ID is available.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .functions
        .invoke('web-scrape', {
          body: {
            query: query,
            marketId: marketId,
            maxIterations: maxIterations,
            focusText: focusText,
						notificationEmail: isEmailNotificationEnabled ? notificationEmail : null
          }
        });

      if (error) {
        console.error("Error invoking web-scrape function:", error);
        setIsProcessing(false);
        setErrorMessage(error.message);
        toast({
          title: "Research Failed",
          description: `Failed to start research: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      const jobId = data?.jobId;

      if (jobId) {
        toast({
          title: "Research Started",
          description: `Research job started successfully.`,
        });

        const newJob = {
          id: jobId,
          market_id: marketId,
          query: query,
          status: 'queued',
          max_iterations: maxIterations,
          current_iteration: 0,
          progress_log: [],
          iterations: [],
          results: [],
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: userId,
          focus_text: focusText,
					notification_email: isEmailNotificationEnabled ? notificationEmail : null,
          notification_sent: false
        };

        setResearchJob(newJob);
        setProgressLog([]);
        setIterations([]);
        setResults([]);
        startSSEStream(jobId);
      } else {
        setIsProcessing(false);
        setErrorMessage("Job ID not received.");
        toast({
          title: "Research Failed",
          description: "Failed to start research: Job ID not received.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error starting research:", error);
      setIsProcessing(false);
      setErrorMessage(error.message);
      toast({
        title: "Research Failed",
        description: `Failed to start research: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const cancelResearch = async () => {
    if (!researchJob?.id) {
      toast({
        title: "No Active Job",
        description: "No active research job to cancel.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(false);

    try {
      const { error } = await supabase
        .functions
        .invoke('cancel-web-scrape', {
          body: {
            jobId: researchJob.id,
          }
        });

      if (error) {
        console.error("Error cancelling web-scrape function:", error);
        toast({
          title: "Cancellation Failed",
          description: `Failed to cancel research: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Research Cancelled",
        description: "Research job cancelled successfully.",
      });

      setResearchJob(null);
    } catch (error: any) {
      console.error("Error cancelling research:", error);
      toast({
        title: "Cancellation Failed",
        description: `Failed to cancel research: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      if (sseClient.current) {
        sseClient.current.close();
      }
    }
  };

  const startSSEStream = (jobId: string) => {
    if (sseClient.current) {
      sseClient.current.close();
    }

    sseClient.current = new EventSource(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/web-scrape-stream?jobId=${jobId}`, {
      withCredentials: true,
    });

    sseClient.current.onmessage = async (event) => {
      if (!event.data) return;

      try {
        const message: SSEMessage = JSON.parse(event.data);

        if (message.type === 'status') {
          setProgressLog(prevLog => [...prevLog, message.content]);
        } else if (message.type === 'iteration') {
          setIterations(prevIterations => [...prevIterations, message.content]);
        } else if (message.type === 'result') {
          setResults(prevResults => [...prevResults, message.content]);
        } else if (message.type === 'jobUpdate') {
          setResearchJob(prevJob => {
            if (!prevJob) return prevJob;
            return { ...prevJob, ...message.content };
          });
        } else if (message.type === 'error') {
          setErrorMessage(message.content);
          setIsProcessing(false);
          toast({
            title: "Research Error",
            description: `An error occurred during research: ${message.content}`,
            variant: "destructive",
          });
          sseClient.current?.close();
        } else if (message.type === 'completed') {
          setIsProcessing(false);
          toast({
            title: "Research Complete",
            description: "Research job completed successfully.",
          });
          sseClient.current?.close();
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
        setErrorMessage("Error parsing SSE message.");
        setIsProcessing(false);
        toast({
          title: "Research Error",
          description: "Error parsing SSE message.",
          variant: "destructive",
        });
        sseClient.current?.close();
      }
    };

    sseClient.current.onerror = (error) => {
      console.error("SSE error:", error);
      setErrorMessage("SSE connection error.");
      setIsProcessing(false);
      toast({
        title: "Research Error",
        description: "SSE connection error.",
        variant: "destructive",
      });
      sseClient.current?.close();
    };
  };

  const getStatusBadge = () => {
    if (errorMessage) {
      return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Error</Badge>;
    }

    if (isProcessing) {
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1 animate-spin" /> Processing</Badge>;
    }

    if (researchJob?.status === 'completed') {
      return <Badge variant="outline"><CheckCircle className="h-3 w-3 mr-1" /> Completed</Badge>;
    }

    if (researchJob?.status === 'queued') {
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Queued</Badge>;
    }

    return null;
  };

  const handleInsightTypeChange = (type: 'analysis' | 'probability' | 'areas') => {
    setSelectedInsightType(type);
  };

  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  const toggleHistory = () => {
    setIsHistoryOpen(!isHistoryOpen);
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">Web Research</h2>
        {getStatusBadge()}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type="text"
            placeholder="Enter your research query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isProcessing}
          />
          <Button onClick={startResearch} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start Research
          </Button>
        </div>

        {researchJob && (
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Job ID: {researchJob.id}
            </p>
            <Button variant="destructive" size="sm" onClick={cancelResearch} disabled={!isProcessing}>
              Cancel Research
            </Button>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-100 text-red-500 rounded-md">
          Error: {errorMessage}
        </div>
      )}

      {iterations.length > 0 && (
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-md font-semibold">Iterations</h3>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={toggleHistory}>
                <History className="h-4 w-4 mr-2" />
                {isHistoryOpen ? 'Hide History' : 'Show History'}
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleSettings}>
                <Settings className="h-4 w-4 mr-2" />
                {isSettingsOpen ? 'Hide Settings' : 'Show Settings'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsInsightsExpanded(!isInsightsExpanded)}>
                <InsightsDisplay className="h-4 w-4 mr-2" />
                {isInsightsExpanded ? 'Hide Insights' : 'Show Insights'}
              </Button>
            </div>
          </div>

          {isSettingsOpen && (
            <div className="border rounded-md p-4">
              <h4 className="text-sm font-semibold mb-2">Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxIterations">Max Iterations</Label>
                  <Input
                    type="number"
                    id="maxIterations"
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <Label htmlFor="focusText">Focus Text</Label>
                  <Input
                    type="text"
                    id="focusText"
                    placeholder="Enter focus keywords"
                    value={focusText}
                    onChange={(e) => setFocusText(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
								<div>
									<Label htmlFor="notificationEmail">
										<div className="flex items-center space-x-2">
											<span>Notification Email</span>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" size="icon">
														<Mail className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem>
														<a href="https://mail.google.com/" target="_blank" rel="noopener noreferrer">
															Open Gmail
														</a>
													</DropdownMenuItem>
													<DropdownMenuItem>
														<a href="https://outlook.live.com/" target="_blank" rel="noopener noreferrer">
															Open Outlook
														</a>
													</DropdownMenuItem>
													<DropdownMenuItem>
														<a href="https://mail.yahoo.com/" target="_blank" rel="noopener noreferrer">
															Open Yahoo Mail
														</a>
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</Label>
									<Input
										type="email"
										id="notificationEmail"
										placeholder="Enter your email"
										value={notificationEmail}
										onChange={(e) => setNotificationEmail(e.target.value)}
										disabled={isProcessing || !isEmailNotificationEnabled}
									/>
								</div>
								<div className="flex items-center space-x-2">
									<Checkbox
										id="emailNotification"
										checked={isEmailNotificationEnabled}
										onCheckedChange={(checked) => setIsEmailNotificationEnabled(!!checked)}
										disabled={isProcessing}
									/>
									<Label htmlFor="emailNotification">Enable Email Notification</Label>
								</div>
              </div>
            </div>
          )}

          {isHistoryOpen && (
            <div className="border rounded-md p-4">
              <h4 className="text-sm font-semibold mb-2">Progress Log</h4>
              <ul className="list-disc pl-5">
                {progressLog.map((log, index) => (
                  <li key={index} className="text-xs">{log}</li>
                ))}
              </ul>
            </div>
          )}

          {isInsightsExpanded && (
            <div className="border rounded-md p-4">
              <h4 className="text-sm font-semibold mb-2">Insights</h4>
              <Select value={selectedInsightType} onValueChange={handleInsightTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Insight Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="probability">Probability Assessment</SelectItem>
                  <SelectItem value="areas">Areas Needing Research</SelectItem>
                </SelectContent>
              </Select>
              {iterations.length > 0 && (
                <InsightsDisplay
                  iterations={iterations}
                  insightType={selectedInsightType}
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            {iterations.map((iteration, index) => (
              <IterationCard
                key={index}
                iteration={iteration}
                iterationNumber={index + 1}
                isCurrentIteration={isProcessing && index === iterations.length - 1}
                isFinalIteration={index === maxIterations - 1}
              />
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="p-4">
          <h3 className="text-md font-semibold">Results</h3>
          <SitePreviewList results={results} />
        </div>
      )}
    </Card>
  );
}
