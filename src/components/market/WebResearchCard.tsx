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
import { ChevronDown, Settings, Search, ArrowLeftCircle } from 'lucide-react'
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
    
    setLoadedResearchId(null);
    
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

        await handleWebScrape(cleanQueries, 1, focusArea);
      } catch (error) {
        console.error("Error generating initial queries:", error);
        
        const cleanDescription = description.trim();
        let keywords = cleanDescription.split(/\s+/).filter(word => word.length > 3);
        
        const fallbackQueries = keywords.length >= 3 
          ? [
              `${keywords.slice(0, 5).join(' ')}`,
              `${keywords.slice(0, 3).join(' ')} latest information`,
              `${keywords.slice(0, 3).join(' ')} analysis prediction`
            ]
          : [
              `${description.split(' ').slice(0, 10).join(' ')}`,
              `${description.split(' ').slice(0, 8).join(' ')} latest`,
              `${description.split(' ').slice(0, 8).join(' ')} prediction`
            ];
        
        setCurrentQueries(fallbackQueries);
        
        setProgress(prev => [...prev, `Using intelligent fallback queries due to error: ${error.message}`]);
        
        await handleWebScrape(fallbackQueries, 1, focusArea);
      }

      setProgress(prev => [...prev, "Research complete!"]);

    } catch (error) {
      console.error('Error in web research:', error);
      setError(`Error occurred during research: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      setIsAnalyzing(false);
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
      
      // Create a unique job ID for this research session
      const { data: userData } = await supabase.auth.getUser();
      const jobData = {
        market_id: marketId,
        query: description,
        user_id: userData?.user?.id || 'anonymous',
        max_iterations: maxIterations,
        current_iteration: iteration,
        status: 'processing',
        created_at: new Date().toISOString(),
        focus_text: focusArea || null
      };
      
      // Create a job record first
      const { data: jobRecord, error: jobError } = await supabase
        .from('research_jobs')
        .insert(jobData)
        .select('id')
        .single();
        
      if (jobError) {
        console.error("Error creating research job:", jobError);
        throw new Error(`Failed to create research job: ${jobError.message}`);
      }
      
      const jobId = jobRecord.id;
      console.log(`Created research job with ID: ${jobId}`);
      
      // Now we have a valid jobId to pass to the web-scrape function
      const scrapePayload = { 
        queries: shortenedQueries,
        marketId: marketId,
        marketDescription: description,
        query: description,
        focusText: typeof focusArea === 'string' ? focusArea : null,
        jobId: jobId // Now we include the jobId parameter
      };

      if (typeof focusArea === 'string' && focusArea) {
        setProgress(prev => [...prev, `Focusing web research on: ${focusArea}`]);
      }
      
      const response = await supabase.functions.invoke('web-scrape', {
        body: JSON.stringify(scrapePayload)
      });

      if (response.error) {
        console.error("Error from web-scrape:", response.error);
        
        // Update job status to failed
        await supabase.rpc('update_research_job_status', {
          job_id: jobId,
          new_status: 'failed',
          error_msg: response.error.message
        });
        
        throw response.error;
      }

      console.log("Received response from web-scrape function:", response);
      
      const allContent: string[] = [...previousContent];
      const iterationResults: ResearchResult[] = [];
      let messageCount = 0;
      let hasResults = false;

      const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
        const textDecoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log("Stream reading complete");
            setProgress(prev => [...prev, `Search Completed for iteration ${iteration}`]);
            break;
          }
          
          const chunk = textDecoder.decode(value);
          console.log("Received chunk:", chunk);
          
          buffer += chunk;
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              
              if (jsonStr === '[DONE]') {
                console.log("Received [DONE] marker");
                continue;
              }
              
              try {
                console.log("Parsing JSON from line:", jsonStr);
                const parsed = JSON.parse(jsonStr);
                
                if (parsed.type === 'results' && Array.isArray(parsed.data)) {
                  console.log("Received results:", parsed.data);
                  iterationResults.push(...parsed.data);
                  setResults(prev => {
                    const combined = [...prev, ...parsed.data];
                    const uniqueResults = Array.from(
                      new Map(combined.map(item => [item.url, item])).values()
                    );
                    return uniqueResults;
                  });
                  
                  parsed.data.forEach((result: ResearchResult) => {
                    if (result?.content) {
                      allContent.push(result.content);
                    }
                  });
                  
                  hasResults = true;
                } else if (parsed.type === 'message' && parsed.message) {
                  console.log("Received message:", parsed.message);
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
                  console.error("Received error from stream:", parsed.message);
                  setProgress(prev => [...prev, `Error: ${parsed.message}`]);
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, "Raw data:", jsonStr);
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

      console.log(`Results after stream processing for iteration ${iteration}:`, iterationResults.length);
      console.log("Content collected:", allContent.length, "items");

      if (allContent.length === 0) {
        setProgress(prev => [...prev, "No results found. Try rephrasing your query."]);
        setError('No content collected from web scraping. Try a more specific query or different keywords.');
        
        // Update job status to failed
        await supabase.rpc('update_research_job_status', {
          job_id: jobId,
          new_status: 'failed',
          error_msg: 'No content collected from web scraping'
        });
        
        setIsLoading(false);
        setIsAnalyzing(false);
        return;
      }

      // Store the iteration results in the job record
      const iterationData = {
        iteration: iteration,
        queries: queries,
        results: iterationResults
      };
      
      await supabase.rpc('append_research_iteration', {
        job_id: jobId,
        iteration_data: JSON.stringify([iterationData])
      });

      await processQueryResults(allContent, iteration, queries, iterationResults, focusArea, jobId);
    } catch (error) {
      console.error(`Error in web research iteration ${iteration}:`, error);
      setError(`Error occurred during research iteration ${iteration}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  };

  const processQueryResults = async (allContent: string[], iteration: number, currentQueries: string[], iterationResults: ResearchResult[], focusArea?: string, jobId?: string) => {
    if (focusArea && typeof focusArea !== 'string') {
      console.warn("Invalid focusArea parameter in processQueryResults:", focusArea);
      focusArea = undefined;
    }
    
    try {
      setIsAnalyzing(true);
      setProgress(prev => [...prev, `Starting content analysis for iteration ${iteration}...`]);
      
      console.log(`Starting content analysis for iteration ${iteration} with content length:`, allContent.join('\n\n').length);
      
      if (allContent.length === 0) {
        setProgress(prev => [...prev, "No content to analyze. Trying simpler queries..."]);
        
        if (iteration < maxIterations) {
          const simplifiedQueries = [
            `${description.split(' ').slice(0, 10).join(' ')}`,
            `${marketId} latest updates`,
            `${description.split(' ').slice(0, 5).join(' ')} news`
          ];
          
          setProgress(prev => [...prev, `Using simplified queries for next iteration...`]);
          setCurrentQueries(simplifiedQueries);
          
          await handleWebScrape(simplifiedQueries, iteration + 1, focusArea, [...allContent]);
          return;
        }
      }
      
      const analyzePayload = {
        content: allContent.join('\n\n'),
        query: description,
        question: description,
        marketId: marketId,
        marketDescription: description,
        previousAnalyses: iterations.map(iter => iter.analysis).join('\n\n'),
        areasForResearch: streamingState.parsedData?.areasForResearch || [],
        marketPrice: marketPrice,
        relatedMarkets: relatedMarkets || []
      };

      console.log(`Analyze payload for market ${marketId} includes ${relatedMarkets?.length || 0} related markets`);

      setIterations(prev => {
        const updatedIterations = [...prev];
        const currentIterIndex = updatedIterations.findIndex(i => i.iteration === iteration);
        
        if (currentIterIndex >= 0) {
          updatedIterations[currentIterIndex] = {
            ...updatedIterations[currentIterIndex],
            analysis: "" // Initialize with empty analysis
          };
        } else {
          updatedIterations.push({
            iteration,
            queries: currentQueries,
            results: iterationResults,
            analysis: "" // Initialize with empty analysis
          });
        }
        
        return updatedIterations;
      });
      
      setExpandedIterations(prev => {
        if (!prev.includes(`iteration-${iteration}`)) {
          return [...prev, `iteration-${iteration}`];
        }
        return prev;
      });
      
      setAnalysis('');
      
      const analysisResponse = await supabase.functions.invoke('analyze-web-content', {
        body: JSON.stringify(analyzePayload)
      });

      if (analysisResponse.error) {
        console.error("Error from analyze-web-content:", analysisResponse.error);
        throw new Error(analysisResponse.error.message || "Error analyzing content");
      }

      const textDecoder = new TextDecoder();
      const reader = new Response(analysisResponse.data.body).body?.getReader();
      
      if (!reader) {
        throw new Error('Failed to get reader from analysis response');
      }
      
      let analysisContent = '';
      let iterationAnalysis = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log("Analysis stream complete");
          
          if (analysisContent) {
            setAnalysis(analysisContent);
            
            setIterations(prev => {
              const updatedIterations = [...prev];
              const currentIterIndex = updatedIterations.findIndex(i => i.iteration === iteration);
              
              if (currentIterIndex >= 0) {
                updatedIterations[currentIterIndex] = {
                  ...updatedIterations[currentIterIndex],
                  analysis: iterationAnalysis
                };
              }
              
              return updatedIterations;
            });
          }
          
          break;
        }
        
        const chunk = textDecoder.decode(value);
        console.log("Received analysis chunk of size:", chunk.length);
        
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            
            try {
              const { content } = cleanStreamContent(jsonStr);
              
              if (content) {
                analysisContent += content;
                iterationAnalysis += content;
                
                setAnalysis(analysisContent);
                
                setIterations(prev => {
                  const updatedIterations = [...prev];
                  const currentIterIndex = updatedIterations.findIndex(i => i.iteration === iteration);
                  
                  if (currentIterIndex >= 0) {
                    updatedIterations[currentIterIndex] = {
                      ...updatedIterations[currentIterIndex],
                      analysis: iterationAnalysis
                    };
                  }
                  
                  return updatedIterations;
                });
                
                await new Promise(resolve => setTimeout(resolve, 0));
              }
            } catch (e) {
              console.debug('Error parsing SSE data:', e);
            }
          }
        }
      }
      
      setIterations(prev => {
        const updatedIterations = [...prev];
        const currentIterIndex = updatedIterations.findIndex(i => i.iteration === iteration);
        
        if (currentIterIndex >= 0) {
          updatedIterations[currentIterIndex] = {
            ...updatedIterations[currentIterIndex],
            analysis: iterationAnalysis
          };
        } else {
          updatedIterations.push({
            iteration,
            queries: currentQueries,
            results: iterationResults,
            analysis: iterationAnalysis
          });
        }
        
        return updatedIterations;
      });

      // If job ID is provided, update the job status to completed
      if (jobId) {
        await supabase.rpc('update_research_job_status', {
          job_id: jobId,
          new_status: 'completed',
          error_msg: null
        });
        console.log(`Updated job ${jobId} status to completed`);
      }

      // Auto-save research if we have meaningful results
      if (allContent.length > 0 && iterationAnalysis) {
        await saveResearch();
      }

      // If this isn't the final iteration, start the next one
      if (iteration < maxIterations) {
        // Extract key areas to research next from the analysis
        const nextQueries = currentQueries.map(q => q); // Default to reusing current queries
        
        try {
          // Try to generate new queries based on the analysis
          if (iterationAnalysis.length > 100) {
            setProgress(prev => [...prev, `Planning queries for iteration ${iteration + 1}...`]);
            
            const queryPayload = { 
              query: description,
              marketId: marketId,
              marketDescription: description,
              previousAnalysis: iterationAnalysis,
              previousQueries: currentQueries,
              question: description,
              iteration: iteration + 1,
              focusText: typeof focusArea === 'string' ? focusArea : null
            };
            
            const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
              body: JSON.stringify(queryPayload)
            });

            if (queriesError) {
              console.error("Error generating follow-up queries:", queriesError);
              throw new Error("Failed to generate follow-up queries");
            }

            if (queriesData?.queries && Array.isArray(queriesData.queries) && queriesData.queries.length > 0) {
              console.log("Generated follow-up queries:", queriesData.queries);
              
              const cleanQueries = queriesData.queries.map(q => q.replace(new RegExp(` ${marketId}$`), ''));
              setProgress(prev => [...prev, `Generated ${cleanQueries.length} queries for iteration ${iteration + 1}`]);
              
              // Start the next iteration with these new queries
              await handleWebScrape(cleanQueries, iteration + 1, focusArea, allContent);
              return;
            }
          }
        } catch (error) {
          console.error("Error planning next iteration queries:", error);
          // Fall back to using modified versions of current queries
        }
        
        // If we reach here, use the current queries with some modifications
        const modifiedQueries = currentQueries.map(q => {
          // Modify slightly to get different results
          if (q.includes("latest")) {
            return q.replace("latest", "recent");
          } else if (q.includes("news")) {
            return q.replace("news", "updates");
          } else {
            return `${q} latest`;
          }
        });
        
        setProgress(prev => [...prev, `Starting iteration ${iteration + 1} with modified queries...`]);
        await handleWebScrape(modifiedQueries, iteration + 1, focusArea, allContent);
      } else {
        setProgress(prev => [...prev, `Completed all ${maxIterations} iterations of research.`]);
        setProgress(prev => [...prev, `Final analysis ready for review.`]);
        
        // Final iteration complete
        setIsAnalyzing(false);
        setIsLoading(false);
      }
    } catch (error) {
      console.error(`Error analyzing content for iteration ${iteration}:`, error);
      setError(`Error analyzing content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsAnalyzing(false);
      setIsLoading(false);
      
      // If job ID is provided, update the job status to failed
      if (jobId) {
        await supabase.rpc('update_research_job_status', {
          job_id: jobId,
          new_status: 'failed',
          error_msg: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  };

  return (
    <Card className="w-full p-0 overflow-hidden bg-card border shadow-sm">
      <ResearchHeader
        onResearch={() => handleResearch()}
        isLoading={isLoading}
        isAnalyzing={isAnalyzing}
        marketId={marketId}
        description={description}
        focusText={focusText}
        parentResearch={parentResearch}
      />
      
      <div className="flex flex-col gap-5 p-4">
        <ProgressDisplay messages={progress} />
        
        {error && (
          <div className="error-display p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
            {error}
          </div>
        )}
        
        {results.length > 0 && (
          <SitePreviewList results={results} />
        )}
        
        {iterations.length > 0 && (
          <div className="iterations-container flex flex-col gap-2">
            <h3 className="text-sm font-medium">Research Iterations</h3>
            <div className="iterations-list space-y-2">
              {iterations.map((iteration) => (
                <IterationCard
                  key={`iteration-${iteration.iteration}`}
                  iteration={iteration}
                  isExpanded={expandedIterations.includes(`iteration-${iteration.iteration}`)}
                  onToggleExpand={() => {
                    setExpandedIterations(prev => 
                      prev.includes(`iteration-${iteration.iteration}`)
                        ? prev.filter(id => id !== `iteration-${iteration.iteration}`)
                        : [...prev, `iteration-${iteration.iteration}`]
                    );
                  }}
                  isStreaming={isAnalyzing && currentIteration === iteration.iteration}
                  isCurrentIteration={currentIteration === iteration.iteration}
                  maxIterations={maxIterations}
                />
              ))}
            </div>
          </div>
        )}
        
        {analysis.length > 0 && (
          <AnalysisDisplay 
            content={analysis} 
            isLoading={isAnalyzing}
          />
        )}
        
        {streamingState.parsedData && (
          <InsightsDisplay 
            streamingState={streamingState}
            onResearchArea={handleResearchArea}
            parentResearch={parentResearch ? {
              id: parentResearch.id,
              focusText: parentResearch.focus_text,
              onView: () => loadSavedResearch(parentResearch)
            } : undefined}
            childResearches={childResearchList.map(research => ({
              id: research.id,
              focusText: research.focus_text || "Unknown focus",
              onView: () => loadSavedResearch(research)
            }))}
          />
        )}
        
        {savedResearch && savedResearch.length > 0 && !isLoading && (
          <div className="saved-research border rounded-md p-4">
            <h3 className="text-sm font-medium mb-2">Saved Research</h3>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {savedResearch.map((research, idx) => (
                  <div 
                    key={research.id}
                    className={`saved-research-item p-3 border rounded-md cursor-pointer hover:bg-accent/30 transition-colors ${research.id === loadedResearchId ? 'bg-accent/20 border-accent' : ''}`}
                    onClick={() => loadSavedResearch(research)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(research.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                        {research.focus_text && (
                          <Badge variant="outline" className="text-xs">
                            Focus: {research.focus_text.substring(0, 20)}{research.focus_text.length > 20 ? '...' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {research.probability && (
                        <span className="text-primary font-medium mr-2">
                          {research.probability}
                        </span>
                      )}
                      {research.query.substring(0, 100)}{research.query.length > 100 ? '...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </Card>
  );
}
