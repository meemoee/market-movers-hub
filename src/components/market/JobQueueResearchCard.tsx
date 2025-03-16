import { useState, useEffect } from 'react'
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
import { Loader2, CheckCircle, AlertCircle, Clock, History, Mail } from "lucide-react"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert" 

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
  const [polling, setPolling] = useState(false)
  const [iterations, setIterations] = useState<any[]>([])
  const [expandedIterations, setExpandedIterations] = useState<number[]>([])
  const [jobStatus, setJobStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | null>(null)
  const [structuredInsights, setStructuredInsights] = useState<any>(null)
  const [focusText, setFocusText] = useState<string>('')
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [savedJobs, setSavedJobs] = useState<ResearchJob[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState<string>('')
  const [enableNotification, setEnableNotification] = useState(false)
  const [isSendingNotification, setIsSendingNotification] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<'pending' | 'sending' | 'sent' | 'failed' | null>(null)
  const [notificationAttempts, setNotificationAttempts] = useState(0)
  const [notificationSendingStarted, setNotificationSendingStarted] = useState(false)
  const MAX_NOTIFICATION_ATTEMPTS = 3

  const { toast } = useToast()

  const resetState = () => {
    setJobId(null);
    setPolling(false);
    setProgress([]);
    setProgressPercent(0);
    setResults([]);
    setError(null);
    setAnalysis('');
    setIterations([]);
    setExpandedIterations([]);
    setJobStatus(null);
    setStructuredInsights(null);
    setNotificationEmail('');
    setEnableNotification(false);
    setNotificationStatus(null);
    setNotificationAttempts(0);
    setNotificationSendingStarted(false);
  }

  useEffect(() => {
    fetchSavedJobs();
  }, [marketId]);

  const fetchSavedJobs = async () => {
    try {
      setIsLoadingJobs(true);
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching research jobs:', error);
        return;
      }
      
      if (data && data.length > 0) {
        setSavedJobs(data as ResearchJob[]);
      }
    } catch (e) {
      console.error('Error in fetchSavedJobs:', e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const loadJobData = (job: ResearchJob) => {
    setJobId(job.id);
    setJobStatus(job.status);
    
    if (job.notification_email) {
      setNotificationEmail(job.notification_email);
      setEnableNotification(true);
      
      if (job.notification_sent) {
        setNotificationStatus('sent');
      } else if (job.status === 'completed') {
        setNotificationStatus('pending');
      } else {
        setNotificationStatus(null);
      }
    }
    
    if (job.max_iterations && job.current_iteration !== undefined) {
      const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
      setProgressPercent(percent);
      
      if (job.status === 'completed') {
        setProgressPercent(100);
      }
    }
    
    if (job.progress_log && Array.isArray(job.progress_log)) {
      setProgress(job.progress_log);
    }
    
    if (job.status === 'queued' || job.status === 'processing') {
      setPolling(true);
    } else if (job.status === 'completed' && job.notification_email && !job.notification_sent) {
      setPolling(true);
      setNotificationStatus('pending');
    }
    
    if (job.iterations && Array.isArray(job.iterations)) {
      setIterations(job.iterations);
      
      if (job.iterations.length > 0) {
        setExpandedIterations([job.iterations.length]);
      }
    }
    
    if (job.status === 'completed' && job.results) {
      try {
        const parsedResults = JSON.parse(job.results);
        if (parsedResults.data && Array.isArray(parsedResults.data)) {
          setResults(parsedResults.data);
        }
        if (parsedResults.analysis) {
          setAnalysis(parsedResults.analysis);
        }
        if (parsedResults.structuredInsights) {
          const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
            calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
            null;
          
          setStructuredInsights({
            parsedData: {
              ...parsedResults.structuredInsights,
              goodBuyOpportunities
            },
            rawText: JSON.stringify(parsedResults.structuredInsights)
          });
        }
      } catch (e) {
        console.error('Error parsing job results:', e);
      }
    }
    
    if (job.status === 'failed') {
      setError(`Job failed: ${job.error_message || 'Unknown error'}`);
    }

    if (job.focus_text) {
      setFocusText(job.focus_text);
    }
  }

  const calculateGoodBuyOpportunities = (probabilityStr: string) => {
    if (!probabilityStr || !bestAsk || !outcomes || outcomes.length < 2) {
      return null;
    }

    const probability = parseInt(probabilityStr.replace('%', '').trim()) / 100;
    if (isNaN(probability)) {
      return null;
    }
    
    const THRESHOLD = 0.05;
    
    const opportunities = [];
    
    if (probability > bestAsk + THRESHOLD) {
      opportunities.push({
        outcome: outcomes[0],
        predictedProbability: probability,
        marketPrice: bestAsk,
        difference: (probability - bestAsk).toFixed(2)
      });
    }
    
    const inferredProbability = 1 - probability;
    const noAskPrice = noBestAsk !== undefined ? noBestAsk : 1 - bestBid;
    
    if (inferredProbability > noAskPrice + THRESHOLD) {
      opportunities.push({
        outcome: outcomes[1] || "NO",
        predictedProbability: inferredProbability,
        marketPrice: noAskPrice,
        difference: (inferredProbability - noAskPrice).toFixed(2)
      });
    }
    
    return opportunities.length > 0 ? opportunities : null;
  };

  const extractProbability = (job: ResearchJob): string | null => {
    if (!job.results || job.status !== 'completed') return null;
    
    try {
      const parsedResults = JSON.parse(job.results);
      if (parsedResults.structuredInsights && parsedResults.structuredInsights.probability) {
        return parsedResults.structuredInsights.probability;
      }
      return null;
    } catch (e) {
      console.error('Error extracting probability from job results:', e);
      return null;
    }
  };

  useEffect(() => {
    if (!jobId || !polling) return;
    
    console.log(`Setting up polling for job ${jobId}, notification status: ${notificationStatus}`);
    
    const pollInterval = setInterval(async () => {
      try {
        console.log(`Polling for job status: ${jobId}, notification status: ${notificationStatus}, attempts: ${notificationAttempts}`);
        const { data, error } = await supabase
          .from('research_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
          
        if (error) {
          console.error('Error polling job status:', error);
          return;
        }
        
        if (!data) {
          console.log('No job data found');
          return;
        }
        
        const job = data as ResearchJob;
        console.log('Job status:', job.status, 'Notification sent:', job.notification_sent);
        
        setJobStatus(job.status);
        
        if (job.max_iterations && job.current_iteration !== undefined) {
          const percent = Math.round((job.current_iteration / job.max_iterations) * 100);
          setProgressPercent(percent);
          
          if (job.status === 'completed') {
            setProgressPercent(100);
          }
        }
        
        if (job.progress_log && Array.isArray(job.progress_log)) {
          const newItems = job.progress_log.slice(progress.length);
          if (newItems.length > 0) {
            setProgress(prev => [...prev, ...newItems]);
          }
        }
        
        if (job.iterations && Array.isArray(job.iterations)) {
          setIterations(job.iterations);
          
          if (job.current_iteration > 0 && !expandedIterations.includes(job.current_iteration)) {
            setExpandedIterations(prev => [...prev, job.current_iteration]);
          }
        }
        
        if (job.status === 'completed') {
          if (progress.length === 0 || !progress.some(msg => msg.includes('Job completed'))) {
            setProgress(prev => [...prev, 'Job completed successfully!']);
          }
          
          if (job.results && (!results.length || !analysis)) {
            try {
              const parsedResults = JSON.parse(job.results);
              if (parsedResults.data && Array.isArray(parsedResults.data)) {
                setResults(parsedResults.data);
              }
              if (parsedResults.analysis) {
                setAnalysis(parsedResults.analysis);
              }
              if (parsedResults.structuredInsights) {
                const goodBuyOpportunities = parsedResults.structuredInsights.probability ? 
                  calculateGoodBuyOpportunities(parsedResults.structuredInsights.probability) : 
                  null;
                
                setStructuredInsights({
                  parsedData: {
                    ...parsedResults.structuredInsights,
                    goodBuyOpportunities
                  },
                  rawText: JSON.stringify(parsedResults.structuredInsights)
                });
              }
            } catch (e) {
              console.error('Error parsing job results:', e);
            }
          }
          
          // Check if notification needs to be sent
          if (job.notification_sent) {
            console.log('Notification already marked as sent in database');
            setNotificationStatus('sent');
          } else if (enableNotification && notificationEmail && notificationStatus !== 'sent') {
            // Only try to send if we haven't already started the process
            if (!notificationSendingStarted) {
              console.log(`Job completed, initiating notification to ${notificationEmail}`);
              setNotificationSendingStarted(true);
              setNotificationStatus('sending');

              if (!progress.some(msg => msg.includes(`Sending email notification to ${notificationEmail}`))) {
                setProgress(prev => [...prev, `Sending email notification to ${notificationEmail}...`]);
              }
              
              try {
                console.log(`Sending first notification attempt to ${notificationEmail}`);
                setNotificationAttempts(prev => prev + 1);
                
                const result = await sendEmailNotification(job.id, notificationEmail);
                
                if (result) {
                  setNotificationStatus('sent');
                  if (!progress.some(msg => msg.includes('Email notification sent successfully'))) {
                    setProgress(prev => [...prev, `Email notification sent successfully to ${notificationEmail}`]);
                  }
                  
                  setPolling(false);
                  await fetchSavedJobs();  // Always refetch the job list to reflect the updated notification status
                }
              } catch (err) {
                console.error('Failed to send email notification:', err);
                
                if (notificationAttempts >= MAX_NOTIFICATION_ATTEMPTS) {
                  setNotificationStatus('failed');
                  setProgress(prev => [...prev, `Failed to send email notification after ${MAX_NOTIFICATION_ATTEMPTS} attempts`]);
                  
                  toast({
                    title: "Notification Failed",
                    description: `Could not send notification email after multiple attempts. You can try again manually.`,
                    variant: "destructive"
                  });
                  
                  await fetchSavedJobs();
                } else {
                  setProgress(prev => [...prev, `Notification attempt ${notificationAttempts} failed, will retry shortly...`]);
                }
              }
            } else if (notificationStatus === 'sending' && notificationAttempts < MAX_NOTIFICATION_ATTEMPTS) {
              // If we're still trying to send and haven't reached the max attempts, try again
              try {
                console.log(`Sending retry notification attempt ${notificationAttempts + 1} to ${notificationEmail}`);
                setNotificationAttempts(prev => prev + 1);
                
                const result = await sendEmailNotification(job.id, notificationEmail);
                
                if (result) {
                  setNotificationStatus('sent');
                  if (!progress.some(msg => msg.includes('Email notification sent successfully'))) {
                    setProgress(prev => [...prev, `Email notification sent successfully to ${notificationEmail}`]);
                  }
                  
                  setPolling(false);
                  await fetchSavedJobs();
                }
              } catch (err) {
                console.error(`Retry ${notificationAttempts} failed:`, err);
                
                if (notificationAttempts >= MAX_NOTIFICATION_ATTEMPTS) {
                  setNotificationStatus('failed');
                  setProgress(prev => [...prev, `Failed to send email notification after ${MAX_NOTIFICATION_ATTEMPTS} attempts`]);
                  
                  toast({
                    title: "Notification Failed",
                    description: `Could not send notification email after multiple attempts. You can try again manually.`,
                    variant: "destructive"
                  });
                  
                  await fetchSavedJobs();
                } else {
                  setProgress(prev => [...prev, `Notification attempt ${notificationAttempts} failed, will retry in 15 seconds...`]);
                }
              }
            } else if (notificationStatus === 'failed') {
              // If notification failed, stop polling
              setPolling(false);
            }
          } else if (!enableNotification || !notificationEmail) {
            // No notification needed, stop polling for completed jobs
            setPolling(false);
          }
        } 
        else if (job.status === 'failed') {
          setError(`Job failed: ${job.error_message || 'Unknown error'}`);
          if (!progress.some(msg => msg.includes('Job failed'))) {
            setProgress(prev => [...prev, `Job failed: ${job.error_message || 'Unknown error'}`]);
          }
          
          setPolling(false);
          await fetchSavedJobs();
        }
      } catch (e) {
        console.error('Error in poll interval:', e);
      }
    }, 3000);
    
    return () => {
      console.log(`Clearing poll interval for job ${jobId}`);
      clearInterval(pollInterval);
    };
  }, [
    jobId, 
    polling, 
    progress.length, 
    expandedIterations, 
    bestBid, 
    bestAsk, 
    noBestBid, 
    outcomes, 
    enableNotification, 
    notificationEmail, 
    notificationStatus, 
    notificationAttempts, 
    notificationSendingStarted
  ]);

  const handleResearch = async (initialFocusText = '') => {
    resetState();
    setIsLoading(true);

    const useFocusText = initialFocusText || focusText;

    try {
      setProgress(prev => [...prev, "Starting research job..."]);
      
      const payload = {
        marketId,
        query: description,
        maxIterations: 3,
        focusText: useFocusText.trim() || undefined,
        notificationEmail: enableNotification && notificationEmail ? notificationEmail : undefined
      };
      
      console.log("Research payload:", payload);
      
      const response = await supabase.functions.invoke('create-research-job', {
        body: JSON.stringify(payload)
      });
      
      if (response.error) {
        console.error("Error creating research job:", response.error);
        throw new Error(`Error creating research job: ${response.error.message}`);
      }
      
      if (!response.data || !response.data.jobId) {
        throw new Error("Invalid response from server - no job ID returned");
      }
      
      const jobId = response.data.jobId;
      setJobId(jobId);
      setPolling(true);
      setJobStatus('queued');
      setProgress(prev => [...prev, `Research job created with ID: ${jobId}`]);
      setProgress(prev => [...prev, `Background processing started...`]);
      
      if (enableNotification && notificationEmail) {
        setProgress(prev => [...prev, `Email notification will be sent to ${notificationEmail} when research completes`]);
        setNotificationStatus('pending');
      }
      
      toast({
        title: "Background Research Started",
        description: `Job ID: ${jobId}. You can close this window and check back later.`,
      });
      
      fetchSavedJobs();
      
    } catch (error) {
      console.error('Error in research job:', error);
      setError(`Error occurred during research job: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setJobStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  const sendEmailNotification = async (jobId: string, email: string) => {
    if (!jobId || !email) {
      throw new Error('Missing required parameters: jobId and email are required');
    }
    
    try {
      setIsSendingNotification(true);
      
      console.log(`Calling send-research-notification for job ${jobId} to email ${email}`);
      
      const response = await supabase.functions.invoke('send-research-notification', {
        body: JSON.stringify({ jobId, email })
      });
      
      console.log("Raw notification response:", response);
      
      if (response.error) {
        console.error("Error sending notification:", response.error);
        toast({
          title: "Notification Error",
          description: `Could not send email notification: ${response.error.message}`,
          variant: "destructive"
        });
        throw new Error(`Error sending notification: ${response.error.message}`);
      }
      
      console.log("Notification response data:", response.data);
      
      if (response.data && response.data.alreadySent) {
        console.log("Notification was already sent previously");
        toast({
          title: "Notification Already Sent",
          description: `Email was previously sent to ${email}`,
        });
        setNotificationStatus('sent');
        return true;
      }
      
      toast({
        title: "Notification Sent",
        description: `Email notification sent to ${email}`,
      });
      
      setSavedJobs(prev => 
        prev.map(job => 
          job.id === jobId 
            ? { ...job, notification_sent: true } 
            : job
        )
      );
      
      return true;
    } catch (error) {
      console.error('Error sending notification:', error);
      toast({
        title: "Notification Error",
        description: `Failed to send email notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsSendingNotification(false);
    }
  };

  const retryNotification = async () => {
    if (!jobId || !notificationEmail) {
      toast({
        title: "Cannot Retry",
        description: "Missing job ID or email address",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setNotificationStatus('sending');
      if (!progress.some(msg => msg.includes(`Retrying email notification`))) {
        setProgress(prev => [...prev, `Retrying email notification to ${notificationEmail}...`]);
      }
      
      await sendEmailNotification(jobId, notificationEmail);
      
      setNotificationStatus('sent');
      setProgress(prev => [...prev, `Email notification successfully sent to ${notificationEmail}`]);
      
      setTimeout(() => {
        fetchSavedJobs();
      }, 2000);
    } catch (error) {
      setNotificationStatus('failed');
      console.error('Retry failed:', error);
      setProgress(prev => [...prev, `Retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`]);
    }
  };

  const toggleIterationExpand = (iteration: number) => {
    setExpandedIterations(prev => 
      prev.includes(iteration) 
        ? prev.filter(i => i !== iteration) 
        : [...prev, iteration]
    );
  };

  const loadSavedResearch = async (jobId: string) => {
    try {
      setIsLoadingSaved(true);
      
      resetState();
      
      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
        
      if (error) {
        console.error('Error loading saved research:', error);
        toast({
          title: "Error",
          description: "Failed to load saved research job.",
          variant: "destructive"
        });
        setIsLoadingSaved(false);
        return;
      }
      
      if (!data) {
        toast({
          title: "Error",
          description: "Research job not found.",
          variant: "destructive"
        });
        setIsLoadingSaved(false);
        return;
      }
      
      const job = data as ResearchJob;
      
      loadJobData(job);
      
      toast({
        title: "Research Loaded",
        description: `Loaded research job ${job.focus_text ? `focused on: ${job.focus_text}` : ''}`,
      });
    } catch (e) {
      console.error('Error loading saved research:', e);
      toast({
        title: "Error",
        description: "An unexpected error occurred while loading the research job.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const handleResearchArea = (area: string) => {
    setFocusText('');
    
    toast({
      title: "Starting Focused Research",
      description: `Creating new research job focused on: ${area}`,
    });
    
    handleResearch(area);
  };

  const handleClearDisplay = () => {
    resetState();
    setFocusText('');
  };

  const renderStatusBadge = () => {
    if (!jobStatus) return null;
    
    switch (jobStatus) {
      case 'queued':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3" />
            <span>Queued</span>
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing</span>
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3" />
            <span>Completed</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderNotificationBadge = () => {
    if (!notificationStatus) return null;
    
    switch (notificationStatus) {
      case 'pending':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3" />
            <span>Notification Pending</span>
          </Badge>
        );
      case 'sending':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Sending Notification</span>
          </Badge>
        );
      case 'sent':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3" />
            <span>Notification Sent</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="h-3 w-3" />
            <span>Notification Failed</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(date);
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500 mr-2" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500 mr-2" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin mr-2" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500 mr-2" />;
      default:
        return null;
    }
  };

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between w-full max-w-full">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Background Job Research</h2>
            {renderStatusBadge()}
            {notificationStatus && renderNotificationBadge()}
          </div>
          <p className="text-sm text-muted-foreground">
            This research continues in the background even if you close your browser.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {jobId ? (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearDisplay}
              disabled={isLoading || isLoadingSaved}
            >
              New Research
            </Button>
          ) : (
            <Button 
              onClick={() => handleResearch()} 
              disabled={isLoading || polling}
              className="flex items-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Starting..." : "Start Research"}
            </Button>
          )}
          
          {savedJobs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={isLoadingJobs || isLoading || isLoadingSaved}
                  className="flex items-center gap-2"
                >
                  {isLoadingJobs ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> 
                  ) : (
                    <History className="h-4 w-4 mr-2" />
                  )}
                  History ({savedJobs.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px] max-h-[400px] overflow-y-auto">
                {savedJobs.map((job) => {
                  const probability = extractProbability(job);
                  
                  return (
                    <DropdownMenuItem
                      key={job.id}
                      onClick={() => loadSavedResearch(job.id)}
                      disabled={isLoadingSaved}
                      className="flex flex-col items-start py-2"
                    >
                      <div className="flex items-center w-full">
                        {getStatusIcon(job.status)}
                        <span className="font-medium truncate flex-1">
                          {job.focus_text ? job.focus_text.slice(0, 20) + (job.focus_text.length > 20 ? '...' : '') : 'General research'}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`ml-2 ${
                            job.status === 'completed' ? 'bg-green-50 text-green-700' : 
                            job.status === 'failed' ? 'bg-red-50 text-red-700' :
                            job.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                            'bg-yellow-50 text-yellow-700'
                          }`}
                        >
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between w-full mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(job.created_at)}
                        </span>
                        {probability && (
                          <Badge variant="secondary" className="text-xs">
                            P: {probability}
                          </Badge>
                        )}
                        {job.notification_email && (
                          <Badge variant="outline" className={`text-xs ml-1 ${
                            job.notification_sent ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                          }`}>
                            {job.notification_sent ? 'Notified' : 'Pending'}
                          </Badge>
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {!jobId && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 w-full">
            <Input
              placeholder="Add an optional focus area for your research..."
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
              disabled={isLoading || polling}
              className="flex-1"
            />
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="email-notification"
                checked={enableNotification}
                onCheckedChange={setEnableNotification}
                disabled={isLoading || polling}
              />
              <Label htmlFor="email-notification" className="cursor-pointer">
                Email notification
              </Label>
            </div>
            
            {enableNotification && (
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="Your email address"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  disabled={isLoading || polling}
                  className="w-full"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {jobId && (
        <div className="space-y-6">
          {focusText && (
            <Alert className="bg-muted">
              <AlertTitle className="text-sm font-medium">Research Focus:</AlertTitle>
              <AlertDescription className="text-sm">{focusText}</AlertDescription>
            </Alert>
          )}

          {notificationStatus && (
            <Alert className={`${
              notificationStatus === 'sent' ? 'bg-green-50 border-green-200' :
              notificationStatus === 'failed' ? 'bg-red-50 border-red-200' :
              'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-center">
                <Mail className={`h-4 w-4 mr-2 ${
                  notificationStatus === 'sent' ? 'text-green-500' :
                  notificationStatus === 'failed' ? 'text-red-500' :
                  'text-blue-500'
                }`} />
                <AlertTitle className="text-sm font-medium">
                  {notificationStatus === 'sent' ? 'Notification Sent' :
                   notificationStatus === 'failed' ? 'Notification Failed' :
                   'Notification Pending'}
                </AlertTitle>
              </div>
              <AlertDescription className="text-sm pl-6">
                {notificationStatus === 'sent' 
                  ? `Email notification was sent to ${notificationEmail}.`
                  : notificationStatus === 'failed'
                  ? <>
                      Failed to send notification to {notificationEmail}.
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={retryNotification}
                        disabled={isSendingNotification}
                        className="ml-2 text-xs h-6"
                      >
                        {isSendingNotification ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Sending...
                          </>
                        ) : (
                          'Retry'
                        )}
                      </Button>
                    </>
                  : `Email will be sent to ${notificationEmail} when research completes.`
                }
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">Progress: {progressPercent}%</div>
              <div className="text-xs text-muted-foreground">
                {jobStatus === 'queued' ? 'Waiting to start...' :
                 jobStatus === 'processing' ? 'Processing...' :
                 jobStatus === 'completed' ? 'Completed' :
                 'Failed'}
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div 
                className={`h-2.5 rounded-full ${
                  jobStatus === 'failed' ? 'bg-red-500' :
                  jobStatus === 'completed' ? 'bg-green-500' :
                  'bg-blue-500'
                }`} 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
          
          {iterations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Research Iterations:</h3>
              <div className="space-y-2">
                {iterations.map((iteration, index) => (
                  <IterationCard 
                    key={index}
                    iteration={iteration}
                    isExpanded={expandedIterations.includes(index + 1)}
                    onToggleExpand={() => toggleIterationExpand(index + 1)}
                    isStreaming={isStreaming && isCurrentIteration && index + 1 === iterations.length}
                    isCurrentIteration={index + 1 === iterations.length}
                    maxIterations={iterations.length}
                  />
                ))}
              </div>
            </div>
          )}
          
          <ProgressDisplay messages={progress} />
          
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            {results.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-3">Research Results</h3>
                <SitePreviewList results={results} />
              </div>
            )}
            
            {analysis && (
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-3">Analysis</h3>
                <AnalysisDisplay content={analysis} />
              </div>
            )}
            
            {structuredInsights && (
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-3">Key Insights</h3>
                <InsightsDisplay 
                  streamingState={structuredInsights}
                  onResearchArea={onResearchArea}
                  marketData={{
                    bestBid,
                    bestAsk,
                    noBestBid,
                    noBestAsk,
                    outcomes
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
