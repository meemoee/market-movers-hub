import { useState, useEffect, useCallback, useRef } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Slider 
} from "@/components/ui/slider"
import { supabase } from "@/integrations/supabase/client"
import { ResearchHeader } from "./research/ResearchHeader"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { IterationCard } from "./research/IterationCard"
import { ChevronDown, Settings, Search, ArrowLeftCircle, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useToast } from "@/components/ui/use-toast"
import { Json } from '@/integrations/supabase/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useRelatedMarkets } from "@/hooks/useRelatedMarkets"

interface WebResearchCardProps {
  description: string;
  marketId: string;
}

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: string;
  } | null;
}

interface ResearchIteration {
  iteration: number;
  queries: string[];
  results: ResearchResult[];
  analysis: string;
}

interface SavedResearch {
  id: string;
  user_id: string;
  query: string;
  sources: ResearchResult[];
  analysis: string;
  probability: string;
  areas_for_research: string[];
  created_at: string;
  updated_at: string;
  market_id: string;
  iterations?: ResearchIteration[];
  focus_text?: string;
  parent_research_id?: string;
}

interface ProgressLogItem {
  message: string;
  timestamp: string;
}

interface ResearchJob {
  id: string;
  user_id: string;
  market_id: string;
  query: string;
  focus_text?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  current_iteration: number;
  max_iterations: number;
  progress_log: ProgressLogItem[];
  iterations: ResearchIteration[];
  results: ResearchResult[];
  areas_for_research: string[];
  analysis?: string;
  probability?: string;
  parent_job_id?: string;
}

export function WebResearchCard({ description, marketId }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [results, setResults] = useState<ResearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [streamingState, setStreamingState] = useState<StreamingState>({
    rawText: '',
    parsedData: null
  })
  const [maxIterations, setMaxIterations] = useState(3)
  const [currentIteration, setCurrentIteration] = useState(0)
  const [iterations, setIterations] = useState<ResearchIteration[]>([])
  const [expandedIterations, setExpandedIterations] = useState<string[]>(['iteration-1'])
  const [currentQueries, setCurrentQueries] = useState<string[]>([])
  const [currentQueryIndex, setCurrentQueryIndex] = useState<number>(-1)
  const [focusText, setFocusText] = useState<string>('')
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [loadedResearchId, setLoadedResearchId] = useState<string | null>(null)
  const [parentResearchId, setParentResearchId] = useState<string | null>(null)
  const [childResearches, setChildResearches] = useState<SavedResearch[]>([])
  const { toast } = useToast()
  const { data: relatedMarkets } = useRelatedMarkets(marketId);
  
  const [isPollingForJob, setIsPollingForJob] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  
  const { data: activeJobs, isLoading: isLoadingJobs, refetch: refetchJobs } = useQuery({
    queryKey: ['active-research-jobs', marketId],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('research_jobs')
        .select('*')
        .eq('market_id', marketId)
        .eq('user_id', user.user.id)
        .in('status', ['running', 'pending'])
        .order('created_at', { ascending: false })

      if (error) throw error
      
      return (data as any[]).map(job => ({
        ...job,
        progress_log: Array.isArray(job.progress_log) 
          ? job.progress_log 
          : (job.progress_log ? JSON.parse(String(job.progress_log)) : []),
        iterations: job.iterations || [],
        results: job.results || [],
        areas_for_research: job.areas_for_research || []
      })) as ResearchJob[];
    },
    refetchInterval: isPollingForJob ? 5000 : false
  })

  const { data: savedResearch, refetch: refetchSavedResearch } = useQuery({
    queryKey: ['saved-research', marketId],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('web_research')
        .select('*')
        .eq('market_id', marketId)
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      return (data as any[]).map(item => ({
        ...item,
        sources: item.sources as ResearchResult[],
        areas_for_research: item.areas_for_research as string[],
        iterations: item.iterations as ResearchIteration[] || [],
        focus_text: item.focus_text,
        parent_research_id: item.parent_research_id
      })) as SavedResearch[]
    }
  })

  const { data: marketData } = useQuery({
    queryKey: ['market-price', marketId],
    queryFn: async () => {
      if (!marketId) return null;
      
      const { data, error } = await supabase
        .from('market_prices')
        .select('last_traded_price, best_bid, best_ask')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: false })
        .limit(1);
        
      if (error) {
        console.error('Error fetching market price:', error);
        return null;
      }
      
      return data && data.length > 0 ? data[0] : null;
    },
    enabled: !!marketId
  });
  
  const marketPrice = marketData?.last_traded_price !== undefined 
    ? Math.round(marketData.last_traded_price * 100) 
    : undefined;

  useEffect(() => {
    if (marketPrice !== undefined) {
      console.log(`Market ID ${marketId} has price: ${marketPrice}%`);
    }
  }, [marketPrice, marketId]);

  const findParentResearch = useCallback((parentId: string | null) => {
    if (!parentId || !savedResearch) return null;
    
    const parent = savedResearch.find(r => r.id === parentId);
    if (parent) {
      console.log(`Found parent research: ${parent.id} with focus: ${parent.focus_text || "none"}`);
      return parent;
    }
    
    console.log(`Parent research with ID ${parentId} not found in savedResearch:`, 
                savedResearch?.length ? savedResearch.map(r => r.id).join(', ') : 'No saved research');
    return null;
  }, [savedResearch]);
  
  const findChildResearches = useCallback((parentId: string | null) => {
    if (!parentId || !savedResearch) return [];
    
    const foundChildResearches = savedResearch.filter(r => r.parent_research_id === parentId);
    if (foundChildResearches.length > 0) {
      console.log(`Found ${foundChildResearches.length} child researches for parent ${parentId}`);
      return foundChildResearches;
    }
    
    return [];
  }, [savedResearch]);
  
  const childResearchList = loadedResearchId ? findChildResearches(loadedResearchId) : [];
  const parentResearch = findParentResearch(parentResearchId);

  const loadSavedResearch = (research: SavedResearch) => {
    setIsLoadingSaved(true);
    setLoadedResearchId(research.id);
    
    setResults(research.sources)
    setAnalysis(research.analysis)
    
    if (research.iterations && research.iterations.length > 0) {
      setIterations(research.iterations)
      setExpandedIterations([`iteration-${research.iterations.length}`])
    }
    
    setStreamingState({
      rawText: JSON.stringify({
        probability: research.probability,
        areasForResearch: research.areas_for_research
      }, null, 2),
      parsedData: {
        probability: research.probability,
        areasForResearch: research.areas_for_research
      }
    })

    setFocusText(research.focus_text || '');
    
    if (research.parent_research_id) {
      console.log(`Loading research with parent ID: ${research.parent_research_id}`);
      setParentResearchId(research.parent_research_id);
    } else {
      setParentResearchId(null);
    }
    
    setTimeout(() => {
      setIsLoadingSaved(false);
    }, 500);
  }

  const loadResearchJob = async (job: ResearchJob) => {
    setIsLoadingSaved(true);
    setActiveJobId(job.id);
    
    if (job.status === 'running' || job.status === 'pending') {
      setIsPollingForJob(true);
      connectToJobEventStream(job.id);
    } else {
      setIsPollingForJob(false);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    }
    
    setLoadedResearchId(null);
    
    // Set progress messages
    const progressMessages = job.progress_log.map(p => p.message);
    setProgress(progressMessages);
    
    // Set results
    if (job.results && job.results.length > 0) {
      setResults(job.results);
    }
    
    // Set iterations
    if (job.iterations && job.iterations.length > 0) {
      setIterations(job.iterations);
      setExpandedIterations([`iteration-${job.iterations.length}`]);
    }
    
    // Set current iteration
    setCurrentIteration(job.current_iteration);
    
    // Set focus text
    setFocusText(job.focus_text || '');
    
    setIsLoadingSaved(false);
  }

  const connectToJobEventStream = (jobId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    
    // Get auth token for the request
    supabase.auth.getSession().then(({ data }) => {
      const authToken = data?.session?.access_token;
      
      if (!authToken) {
        console.error("No auth token available");
        return;
      }
      
      try {
        // Create event source for SSE
        const functionsUrl = supabase.functions.url('web-scrape');
        const url = `${functionsUrl}/connect?jobId=${jobId}&token=${authToken}`;
        const eventSource = new EventSource(url);
        
        eventSource.onmessage = (event) => {
          try {
            if (event.data === '[DONE]') {
              eventSource.close();
              setIsPollingForJob(false);
              refetchJobs();
              refetchSavedResearch();
              return;
            }
            
            const data = JSON.parse(event.data);
            
            if (data.type === 'message') {
              setProgress(prev => [...prev, data.message]);
            } else if (data.type === 'results') {
              setResults(prev => {
                const combined = [...prev, ...data.data];
                const uniqueResults = Array.from(
                  new Map(combined.map(item => [item.url, item])).values()
                );
                return uniqueResults;
              });
            } else if (data.type === 'job') {
              if (data.status === 'completed') {
                eventSource.close();
                setIsPollingForJob(false);
                refetchJobs();
                refetchSavedResearch();
              }
            } else if (data.type === 'error') {
              setError(data.message);
            }
          } catch (e) {
            console.error("Error handling SSE message:", e);
          }
        };
        
        eventSource.onerror = (error) => {
          console.error("SSE Error:", error);
          eventSource.close();
          setIsPollingForJob(true); // Fall back to polling
        };
        
        sseRef.current = eventSource;
      } catch (error) {
        console.error("Error connecting to SSE:", error);
        setIsPollingForJob(true); // Fall back to polling
      }
    });
  }

  const checkForRunningJobs = useCallback(() => {
    if (!activeJobs || activeJobs.length === 0) return;
    
    const latestJob = activeJobs[0];
    
    // If we already have an active job loaded, don't override
    if (activeJobId === latestJob.id) return;
    
    // If we're already showing research, ask before loading
    if (results.length > 0 || isAnalyzing || isLoading) {
      // Could show a notification here to switch to running job
      return;
    }
    
    // Auto-load the running job
    console.log("Auto-loading running research job:", latestJob.id);
    loadResearchJob(latestJob);
  }, [activeJobs, activeJobId, results.length, isAnalyzing, isLoading]);

  // Check for running jobs on mount and when activeJobs changes
  useEffect(() => {
    checkForRunningJobs();
  }, [checkForRunningJobs]);

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  const isCompleteMarkdown = (text: string): boolean => {
    const stack: string[] = [];
    let inCode = false;
    let inList = false;
    let currentNumber = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      const prevChar = text[i - 1];
      
      if (char === '`' && nextChar === '`' && text[i + 2] === '`') {
        inCode = !inCode;
        i += 2;
        continue;
      }
      
      if (inCode) continue;
      
      if (/^\d$/.test(char)) {
        currentNumber += char;
        continue;
      }
      if (char === '.' && currentNumber !== '') {
        inList = true;
        currentNumber = '';
        continue;
      }
      
      if (char === '\n') {
        inList = false;
        currentNumber = '';
      }
      
      if (char === '*' && nextChar === '*') {
        const pattern = '**';
        if (stack.length > 0 && stack[stack.length - 1] === pattern) {
          stack.pop();
        } else {
          stack.push(pattern);
        }
        i++;
        continue;
      }
      
      if ((char === '*' || char === '`' || char === '_') && 
          !(prevChar && nextChar && /\w/.test(prevChar) && /\w/.test(nextChar))) {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        } else {
          stack.push(char);
        }
      }
    }
    
    return stack.length === 0 && !inCode && !inList;
  };

  const cleanStreamContent = (chunk: string): { content: string } => {
    try {
      let dataStr = chunk;
      if (dataStr.startsWith('data: ')) {
        dataStr = dataStr.slice(6);
      }
      dataStr = dataStr.trim();
      
      if (dataStr === '[DONE]') {
        return { content: '' };
      }
      
      const parsed = JSON.parse(dataStr);
      const content = parsed.choices?.[0]?.delta?.content || 
                     parsed.choices?.[0]?.message?.content || '';
      return { content };
    } catch (e) {
      console.debug('Chunk parse error (expected during streaming):', e);
      return { content: '' };
    }
  };

  const saveResearch = async () => {
    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) {
        throw new Error('Not authenticated')
      }

      if (isLoadingSaved) {
        console.log("Skipping save because research is currently being loaded");
        return;
      }
      
      if (loadedResearchId && savedResearch?.some(r => r.id === loadedResearchId)) {
        console.log(`Skipping save for already existing research with ID: ${loadedResearchId}`);
        return;
      }

      const sanitizeJson = (data: any): any => {
        if (data === null || data === undefined) return null;
        
        if (typeof data === 'string') {
          return data.replace(/\u0000/g, '').replace(/\\u0000/g, '');
        }
        
        if (Array.isArray(data)) {
          return data.map(item => sanitizeJson(item));
        }
        
        if (typeof data === 'object') {
          const result: Record<string, any> = {};
          for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              result[key] = sanitizeJson(data[key]);
            }
          }
          return result;
        }
        
        return data;
      };

      const sanitizedResults = sanitizeJson(results);
      const sanitizedAnalysis = analysis ? analysis.replace(/\u0000/g, '') : '';
      const sanitizedAreasForResearch = sanitizeJson(streamingState.parsedData?.areasForResearch);
      const sanitizedIterations = sanitizeJson(iterations);
      const sanitizedFocusText = focusText ? focusText.replace(/\u0000/g, '') : null;
      
      const researchPayload = {
        user_id: user.user.id,
        query: description.replace(/\u0000/g, ''),
        sources: sanitizedResults as unknown as Json,
        analysis: sanitizedAnalysis,
        probability: streamingState.parsedData?.probability?.replace(/\u0000/g, '') || '',
        areas_for_research: sanitizedAreasForResearch as unknown as Json,
        market_id: marketId,
        iterations: sanitizedIterations as unknown as Json,
        focus_text: sanitizedFocusText,
        parent_research_id: parentResearchId
      };

      console.log("Saving sanitized research data", parentResearchId ? `with parent research: ${parentResearchId}` : "without parent");
      const { data, error } = await supabase.from('web_research').insert(researchPayload).select('id')

      if (error) throw error

      if (data && data[0] && data[0].id) {
        setLoadedResearchId(data[0].id);
        console.log(`Set loadedResearchId to ${data[0].id} to prevent duplicate saves`);
      }

      toast({
        title: "Research saved",
        description: "Your research has been saved automatically.",
      })
      
      await refetchSavedResearch();
    } catch (error) {
      console.error('Error saving research:', error)
      toast({
        title: "Error",
        description: "Failed to save research automatically. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleResearchArea = (area: string) => {
    const currentResearchId = loadedResearchId;
    
    console.log(`Starting focused research with parent ID: ${currentResearchId} on area: ${area}`);
    
    if (!currentResearchId) {
      console.warn("Cannot create focused research: No parent research ID available");
      toast({
        title: "Cannot create focused research",
        description: "Please save the current research first",
        variant: "destructive"
      });
      return;
    }
    
    const parentId = currentResearchId;
    
    setLoadedResearchId(null);
    setParentResearchId(parentId);
    setFocusText(area);
    
    toast({
      title: "Research focus set",
      description: `Starting new research focused on: ${area}`
    });
    
    setIsLoading(true);
    setProgress([]);
    setResults([]);
    setError(null);
    setAnalysis('');
    setIsAnalyzing(false);
    setStreamingState({ rawText: '', parsedData: null });
    setCurrentIteration(0);
    setIterations([]);
    setExpandedIterations(['iteration-1']);
    setCurrentQueries([]);
    setCurrentQueryIndex(-1);
    
    handleResearch(area);
  };

  const handleResearch = async (focusArea?: string) => {
    if (focusArea && typeof focusArea !== 'string') {
      console.warn("Invalid focusArea parameter:", focusArea);
      focusArea = undefined; // Reset to undefined if it's not a string
    }
    
    // Close existing SSE connection
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    
    setLoadedResearchId(null);
    setActiveJobId(null);
    
    setIsLoading(true);
    setProgress([]);
    setResults([]);
    setError(null);
    setAnalysis('');
    setIsAnalyzing(false);
    setStreamingState({ rawText: '', parsedData: null });
    setCurrentIteration(0);
    setIterations([]);
    setExpandedIterations(['iteration-1']);
    setCurrentQueries([]);
    setCurrentQueryIndex(-1);

    try {
      setProgress(prev => [...prev, "Starting iterative web research..."]);
      setProgress(prev => [...prev, `Researching market: ${marketId}`]);
      setProgress(prev => [...prev, `Market question: ${description}`]);
      
      if (typeof focusArea === 'string' && focusArea) {
        setProgress(prev => [...prev, `Research focus: ${focusArea}`]);
      }
      
      setProgress(prev => [...prev, "Generating initial search queries..."]);

      try {
        const queryPayload = { 
          query: description,
          marketId: marketId,
          marketDescription: description,
          question: description,
          iteration: 1,
          focusText: typeof focusArea === 'string' ? focusArea : null
        };
        
        console.log("Calling generate-queries with:", queryPayload);
        
        const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
          body: JSON.stringify(queryPayload)
        });

        if (queriesError) {
          console.error("Error from generate-queries:", queriesError)
          throw new Error(`Error generating queries: ${queriesError.message}`)
        }

        console.log("Received queries data:", queriesData)

        if (!queriesData?.queries || !Array.isArray(queriesData.queries)) {
          console.error("Invalid queries response:", queriesData)
          throw new Error('Invalid queries response')
        }

        const cleanQueries = queriesData.queries.map(q => q.replace(new RegExp(` ${marketId}$`), ''));
        
        console.log("Generated clean queries:", cleanQueries);
        setProgress(prev => [...prev, `Generated ${cleanQueries.length} search queries`]);
        
        setCurrentQueries(cleanQueries);
        
        cleanQueries.forEach((query: string, index: number) => {
          setProgress(prev => [...prev, `Query ${index + 1}: "${query}"`]);
        });

        const { data: user } = await supabase.auth.getUser();
        if (!user?.user?.id) {
          throw new Error('User not authenticated');
        }

        // Get auth token for the request
        const { data: session } = await supabase.auth.getSession();
        const authToken = session?.session?.access_token;
        
        if (!authToken) {
          throw new Error('No auth token available');
        }

        // Call web-scrape function with auth token
        const response = await supabase.functions.invoke('web-scrape', {
          body: JSON.stringify({
            queries: cleanQueries,
            marketId,
            focusText: focusArea,
            authToken
          })
        });

        if (response.error) {
          throw new Error(`Web scrape error: ${response.error.message}`);
        }

        // Process the streaming response
        const reader = new Response(response.data.body).body?.getReader();
        
        if (!reader) {
          throw new Error('Failed to get reader from response');
        }

        const textDecoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log("Stream reading complete");
            break;
          }
          
          const chunk = textDecoder.decode(value);
          buffer += chunk;
          
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              
              if (jsonStr === '[DONE]') {
                continue;
              }
              
              try {
                const parsed = JSON.parse(jsonStr);
                
                if (parsed.type === 'job') {
                  console.log("Received job info:", parsed);
                  setActiveJobId(parsed.jobId);
                  
                  if (parsed.status === 'running') {
                    setIsPollingForJob(true);
                  } else if (parsed.status === 'completed') {
                    setIsPollingForJob(false);
                    await refetchJobs();
                    await refetchSavedResearch();
                  }
                } 
                else if (parsed.type === 'message') {
                  setProgress(prev => [...prev, parsed.message]);
                }
                else if (parsed.type === 'results') {
                  setResults(prev => {
                    const combined = [...prev, ...parsed.data];
                    const uniqueResults = Array.from(
                      new Map(combined.map(item => [item.url, item])).values()
                    );
                    return uniqueResults;
                  });
                }
                else if (parsed.type === 'error') {
                  setError(parsed.message);
                }
              } catch (e) {
                console.error("Error handling SSE message:", e);
              }
            }
          }
        }
        
        // After stream completion, poll for job updates if needed
        if (activeJobId) {
          setIsPollingForJob(true);
        }
        
        setProgress(prev => [...prev, "Research is continuing in the background..."]);

      } catch (error) {
        console.error("Error in research process:", error);
        setError(`Error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error in web research:', error);
      setError(`Error occurred during research: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  const handleWebScrape = async (queries: string[], iteration: number, focusArea?: string, previousContent: string[] = []) => {
    if (focusArea && typeof focusArea !== 'string') {
      console.warn("Invalid focusArea parameter in handleWebScrape:", focusArea);
      focusArea = undefined;
    }
    
    try {
      setProgress(prev => [...prev, `Starting iteration ${iteration} of ${maxIterations}...`]);
      setCurrentIteration(iteration);
      setExpandedIterations(prev => [...prev, `iteration-${iteration}`]);
      
      console.log(`Calling web-scrape function with queries for iteration ${iteration}:`, queries);
      console.log(`Market ID for web-scrape: ${marketId}`);
      console.log(`Market description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`);
      console.log(`Focus text for web-scrape: ${focusArea || 'none'}`);
      
      setCurrentQueries(queries);
      setCurrentQueryIndex(-1);
      
      const shortenedQueries = queries.map(query => {
        const cleanedQuery = query.replace(new RegExp(` ${marketId}$`), '');
        if (cleanedQuery.length > 200) {
          return cleanedQuery.substring(0, 200);
        }
        return cleanedQuery;
      });
      
      const scrapePayload = { 
        queries: shortenedQueries,
        marketId: marketId,
        marketDescription: description,
        query: description,
        focusText: typeof focusArea === 'string' ? focusArea : null
      };

      if (typeof focusArea === 'string' && focusArea) {
        setProgress(prev => [...prev, `Focusing web research on: ${focusArea}`]);
      }
      
      const response = await supabase.functions.invoke('web-scrape', {
        body: JSON.stringify(scrapePayload)
      })

      if (response.error) {
        console.error("Error from web-scrape:", response.error)
        throw response.error
      }

      console.log("Received response from web-scrape function:", response)
      
      const allContent: string[] = [...previousContent]
      const iterationResults: ResearchResult[] = []
      let messageCount = 0;
      let hasResults = false;

      const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
        const textDecoder = new TextDecoder()
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            console.log("Stream reading complete")
            setProgress(prev => [...prev, `Search Completed for iteration ${iteration}`])
            break
          }
          
          const chunk = textDecoder.decode(value)
          console.log("Received chunk:", chunk)
          
          buffer += chunk
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim()
              
              if (jsonStr === '[DONE]') {
                console.log("Received [DONE] marker")
                continue
              }
              
              try {
                console.log("Parsing JSON from line:", jsonStr)
                const parsed = JSON.parse(jsonStr)
                
                if (parsed.type === 'results' && Array.isArray(parsed.data)) {
                  console.log("Received results:", parsed.data)
                  iterationResults.push(...parsed.data)
                  setResults(prev => {
                    const combined = [...prev, ...parsed.data]
                    const uniqueResults = Array.from(
                      new Map(combined.map(item => [item.url, item])).values()
                    )
                    return uniqueResults
                  })
                  
                  parsed.data.forEach((result: ResearchResult) => {
                    if (result?.content) {
                      allContent.push(result.content)
                    }
                  })
                  
                  hasResults = true;
                } else if (parsed.type === 'message' && parsed.message) {
                  console.log("Received message:", parsed.message)
                  messageCount++;
                  
                  const queryMatch = parsed.message.match(/processing query (\d+)\/\d+: (.*)/i);
                  if (queryMatch && queryMatch[1] && queryMatch[2]) {
                    const queryIndex = parseInt(queryMatch[1], 10) - 1;
                    setCurrentQueryIndex(queryIndex);
                    
                    const cleanQueryText = queryMatch[2].replace(new RegExp(` ${marketId}$`), '');
                    setProgress(prev => [...prev, `Iteration ${iteration}: Searching "${cleanQueryText}"`]);
                  } else {
                    setProgress(prev => [...prev, parsed.message]);
                  }
                } else if (parsed.type === 'error' && parsed.message) {
                  console.error("Received error from stream:", parsed.message)
                  setProgress(prev => [...prev, `Error: ${parsed.message}`])
                }
              } catch (error) {
                console.error('Error parsing SSE data:', error);
              }
            }
          }
        }
      };

      const reader = new Response(response.data.body).body?.getReader();
      if (!reader) {
        throw new Error('Failed to get reader from response');
      }

      await processStream(reader);

      if (hasResults) {
        setProgress(prev => [...prev, "Research completed successfully"]);
      } else {
        setProgress(prev => [...prev, "No results found"]);
      }
    } catch (error) {
      console.error('Error in web search:', error);
      setError(`Error in web search: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <ResearchHeader 
        description={description}
        onResearch={handleResearch}
        isLoading={isLoading} 
        hasResults={results.length > 0}
        onSave={saveResearch}
      />

      <div className="p-4 space-y-4">
        {progress.length > 0 && (
          <ProgressDisplay messages={progress} />
        )}

        {error && (
          <div className="p-4 bg-red-50 text-red-800 rounded-md">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {results.length > 0 && (
          <SitePreviewList 
            results={results} 
            onViewAnalysis={() => {}} 
          />
        )}

        {iterations.length > 0 && iterations.map((iteration, index) => (
          <IterationCard
            key={`iteration-${iteration.iteration}`}
            iteration={iteration}
            isExpanded={expandedIterations.includes(`iteration-${iteration.iteration}`)}
            onToggle={() => {
              setExpandedIterations(prev => {
                const id = `iteration-${iteration.iteration}`;
                if (prev.includes(id)) {
                  return prev.filter(i => i !== id);
                } else {
                  return [...prev, id];
                }
              });
            }}
          />
        ))}

        {streamingState.parsedData && (
          <InsightsDisplay 
            data={streamingState.parsedData} 
            onResearchArea={handleResearchArea}
          />
        )}

        {analysis && (
          <AnalysisDisplay analysis={analysis} />
        )}
      </div>
    </Card>
  );
}

