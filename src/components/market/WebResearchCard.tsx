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
import { EventIcon } from "./chart/EventIcon"

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
    supportingPoints?: string[];
    negativePoints?: string[];
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
  const [previousResearchContext, setPreviousResearchContext] = useState<{
    queries: string[],
    analyses: string[],
    probability?: string,
    supportingPoints?: string[],
    negativePoints?: string[]
  } | null>(null)
  const { toast } = useToast()

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
      
      const allQueries = research.iterations.flatMap(iter => iter.queries || []);
      const allAnalyses = research.iterations.map(iter => iter.analysis || '').filter(a => a);
      
      setPreviousResearchContext({
        queries: allQueries,
        analyses: allAnalyses,
        probability: research.probability,
        supportingPoints: research.probability && research.areas_for_research ? 
                         streamingState.parsedData?.supportingPoints || [] : [],
        negativePoints: research.probability && research.areas_for_research ? 
                       streamingState.parsedData?.negativePoints || [] : []
      });
    }
    
    setStreamingState({
      rawText: JSON.stringify({
        probability: research.probability,
        areasForResearch: research.areas_for_research,
        supportingPoints: streamingState.parsedData?.supportingPoints || [],
        negativePoints: streamingState.parsedData?.negativePoints || []
      }, null, 2),
      parsedData: {
        probability: research.probability,
        areasForResearch: research.areas_for_research,
        supportingPoints: streamingState.parsedData?.supportingPoints || [],
        negativePoints: streamingState.parsedData?.negativePoints || []
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
        if (data === null || data === undefined) {
          if (Array.isArray(data)) {
            return [];
          }
          return null;
        }
        
        if (typeof data === 'string') {
          return data.replace(/\u0000/g, '').replace(/\\u0000/g, '');
        }
        
        if (Array.isArray(data)) {
          if (data.length === 0) return [];
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
      
      const areasForResearch = streamingState.parsedData?.areasForResearch || [];
      const sanitizedAreasForResearch = Array.isArray(areasForResearch) ? 
        sanitizeJson(areasForResearch) : [];
      
      if (sanitizedAreasForResearch === null) {
        console.warn("areas_for_research would be null, using empty array instead");
      }
      
      const sanitizedIterations = sanitizeJson(iterations);
      const sanitizedFocusText = focusText ? focusText.replace(/\u0000/g, '') : null;
      
      console.log("Areas for research before insert:", 
                 typeof sanitizedAreasForResearch, 
                 Array.isArray(sanitizedAreasForResearch), 
                 sanitizedAreasForResearch);
      
      const researchPayload = {
        user_id: user.user.id,
        query: description.replace(/\u0000/g, ''),
        sources: sanitizedResults as unknown as Json,
        analysis: sanitizedAnalysis,
        probability: streamingState.parsedData?.probability?.replace(/\u0000/g, '') || '',
        areas_for_research: (Array.isArray(sanitizedAreasForResearch) && sanitizedAreasForResearch.length > 0) ? 
                           sanitizedAreasForResearch as unknown as Json : 
                           ["Further research needed"] as unknown as Json,
        market_id: marketId,
        iterations: sanitizedIterations as unknown as Json,
        focus_text: sanitizedFocusText,
        parent_research_id: parentResearchId
      };

      console.log("Saving sanitized research data", parentResearchId ? `with parent research: ${parentResearchId}` : "without parent");
      
      console.log("Final areas_for_research value type:", 
                 typeof researchPayload.areas_for_research,
                 "isArray:", Array.isArray(researchPayload.areas_for_research),
                 "value:", researchPayload.areas_for_research);
      
      const { data, error } = await supabase.from('web_research').insert(researchPayload).select('id')

      if (error) {
        console.error("Database error on insert:", error);
        throw error;
      }

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

  const handleStartResearch = () => {
    setIsLoading(true)
    setError(null)
    setProgress([])
    setResults([])
    setAnalysis('')
    setIterations([])
    setExpandedIterations(['iteration-1'])
    setLoadedResearchId(null)
    setStreamingState({
      rawText: '',
      parsedData: null
    })
    
    if (focusText.trim()) {
      setProgress([`Starting focused research on: ${focusText.trim()}`])
    } else {
      setProgress([`Starting web research for: ${description}`])
    }

    generateInitialQueries(1)
      .catch(error => {
        console.error('Error in research process:', error)
        setError(`Research process failed: ${error.message}`)
        setIsLoading(false)
      })
  }

  const generateInitialQueries = async (iteration: number) => {
    try {
      setProgress(prev => [...prev, `Generating search queries for iteration ${iteration}...`])
      
      const queryPayload = {
        description,
        marketId,
        iteration,
        previousResults: iterations.map(iter => iter.analysis).filter(Boolean)
      }
      
      const { data: queryData, error: queryError } = await supabase.functions.invoke('generate-search-queries', {
        body: JSON.stringify(queryPayload)
      })
      
      if (queryError) {
        console.error("Error generating queries:", queryError)
        throw new Error(`Failed to generate search queries: ${queryError.message}`)
      }
      
      if (!queryData || !queryData.queries || !Array.isArray(queryData.queries) || queryData.queries.length === 0) {
        throw new Error("Invalid query generation response")
      }
      
      console.log(`Generated queries for iteration ${iteration}:`, queryData.queries)
      setProgress(prev => [...prev, `Generated ${queryData.queries.length} search queries for iteration ${iteration}`])
      
      queryData.queries.forEach((query: string, index: number) => {
        setProgress(prev => [...prev, `Query ${index + 1}: "${query}"`])
      })
      
      setCurrentQueries(queryData.queries)
      await handleWebScrape(queryData.queries, iteration, [])
      
    } catch (error) {
      console.error("Error generating initial queries:", error)
      
      const fallbackQueries = [
        `${description}`,
        `${description} probability`,
        `${description} analysis`
      ]
      
      setProgress(prev => [...prev, `Using fallback queries due to query generation error: ${error.message}`])
      setCurrentQueries(fallbackQueries)
      await handleWebScrape(fallbackQueries, iteration, [])
    }
  }

  const handleWebScrape = async (queries: string[], iteration: number, previousContent: string[] = []) => {
    try {
      setProgress(prev => [...prev, `Starting iteration ${iteration} of ${maxIterations}...`])
      setCurrentIteration(iteration)
      setExpandedIterations(prev => [...prev, `iteration-${iteration}`])
      
      console.log(`Calling web-scrape function with queries for iteration ${iteration}:`, queries)
      console.log(`Market ID for web-scrape: ${marketId}`)
      console.log(`Market description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`)
      
      setCurrentQueries(queries);
      setCurrentQueryIndex(-1);
      
      const shortenedQueries = queries.map(query => {
        const cleanedQuery = query.replace(new RegExp(` ${marketId}$`), '');
        if (cleanedQuery.length > 200) {
          return cleanedQuery.substring(0, 200);
        }
        return cleanedQuery;
      });
      
      const scrapePayload: any = { 
        queries: shortenedQueries,
        marketId: marketId,
        marketDescription: description
      };

      if (focusText?.trim()) {
        scrapePayload.focusText = focusText.trim();
        scrapePayload.researchFocus = focusText.trim();
        
        if (previousResearchContext) {
          scrapePayload.previousQueries = previousResearchContext.queries;
          scrapePayload.previousAnalyses = previousResearchContext.analyses;
          scrapePayload.previousProbability = previousResearchContext.probability;
          scrapePayload.supportingPoints = previousResearchContext.supportingPoints || [];
          scrapePayload.negativePoints = previousResearchContext.negativePoints || [];
          
          setProgress(prev => [...prev, 
            `Using context from ${previousResearchContext.queries.length} previous queries and ${previousResearchContext.analyses.length} analyses for focused research.`
          ]);
          
          if (previousResearchContext.probability) {
            setProgress(prev => [...prev, 
              `Previous probability estimate: ${previousResearchContext.probability}`
            ]);
          }
        }
        
        setProgress(prev => [...prev, `Focusing web research on: ${focusText.trim()}`]);
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
              } catch (e) {
                console.error('Error parsing SSE data:', e, "Raw data:", jsonStr)
              }
            }
          }
        }
      }

      const reader = new Response(response.data.body).body?.getReader()
      
      if (!reader) {
        throw new Error('Failed to get reader from response')
      }
      
      await processStream(reader)

      console.log(`Results after stream processing for iteration ${iteration}:`, iterationResults.length)
      console.log("Content collected:", allContent.length, "items")

      if (allContent.length === 0) {
        setProgress(prev => [...prev, "No results found. Try rephrasing your query."])
        setError('No content collected from web scraping. Try a more specific query or different keywords.')
        setIsLoading(false)
        setIsAnalyzing(false)
        return
      }

      await processQueryResults(allContent, iteration, queries, iterationResults)
    } catch (error) {
      console.error(`Error in web research iteration ${iteration}:`, error)
      setError(`Error occurred during research iteration ${iteration}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setIsLoading(false)
      setIsAnalyzing(false)
    }
  }

  const processQueryResults = async (allContent: string[], iteration: number, currentQueries: string[], iterationResults: ResearchResult[]) => {
    try {
      setIsAnalyzing(true)
      setProgress(prev => [...prev, `Starting content analysis for iteration ${iteration}...`])
      
      console.log(`Starting content analysis for iteration ${iteration} with content length:`, allContent.join('\n\n').length)
      
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
          await handleWebScrape(simplifiedQueries, iteration + 1, [...allContent]);
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
        focusArea: focusText || undefined,
        previousQueries: currentQueries,
        supportingPoints: previousResearchContext?.supportingPoints || [],
        negativePoints: previousResearchContext?.negativePoints || [],
        parentResearchId: parentResearchId || undefined
      };

      console.log(`Analyze payload for market ${marketId} includes marketPrice: ${marketPrice}`);
      console.log(`Analyze payload includes focus area: ${focusText || 'none'}`);
      
      if (previousResearchContext) {
        console.log(`Analyze payload includes ${previousResearchContext.supportingPoints?.length || 0} supporting points and ${previousResearchContext.negativePoints?.length || 0} negative points`);
      }

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
      
      if (iteration === maxIterations) {
        setProgress(prev => [...prev, "Final analysis complete, extracting key insights..."]);
        await extractInsights(allContent, analysisContent);
      } else {
        setProgress(prev => [...prev, "Generating new queries based on analysis..."]);
        
        try {
          await generateInitialQueries(iteration + 1);
        } catch (error) {
          console.error("Error generating refined queries:", error);
          
          const fallbackQueries = [
            `${description} latest information`,
            `${description} expert analysis`,
            `${description} key details`
          ]
          
          setProgress(prev => [...prev, `Using fallback queries for iteration ${iteration + 1} due to error: ${error.message}`])
          setCurrentQueries(fallbackQueries);
          await handleWebScrape(fallbackQueries, iteration + 1, [...allContent])
        }
      }

      return analysisContent;
    } catch (error) {
      console.error("Error in processQueryResults:", error);
      setError(`Error analyzing content: ${error.message}`);
      setIsAnalyzing(false);
    }
  }

  const extractInsights = async (allContent: string[], finalAnalysis: string) => {
    setProgress(prev => [...prev, "Final analysis complete, extracting key insights and probability estimates..."]);
    
    const previousAnalyses = iterations.map(iter => iter.analysis);
    
    const allQueries = iterations.flatMap(iter => iter.queries);
    
    const insightsPayload = {
      webContent: allContent.join('\n\n'),
      analysis: finalAnalysis,
      marketId: marketId,
      marketQuestion: description,
      previousAnalyses: previousAnalyses,
      iterations: iterations,
      queries: allQueries,
      areasForResearch: streamingState.parsedData?.areasForResearch || [],
      marketPrice: marketPrice
    };
    
    setStreamingState({
      rawText: '',
      parsedData: {
        probability: "Unknown (parsing error)",
        areasForResearch: ["Could not parse research areas due to format error."],
        reasoning: "Error parsing model output."
      }
    });

    setProgress(prev => [...prev, `Extracting probability and reasoning from insights...`]);
    
    try {
      const { data: insightsData, error: insightsError } = await supabase.functions.invoke('extract-research-insights', {
        body: insightsPayload
      });

      if (insightsError) {
        console.error("Error from extract-research-insights:", insightsError);
        throw new Error(insightsError.message || "Error extracting insights");
      }

      if (!insightsData) {
        throw new Error("No data received from extract-research-insights");
      }

      console.log("Received response from extract-research-insights:", insightsData);

      try {
        const parsedData = insightsData;
        
        if (parsedData) {
          const probability = parsedData.probability || "Unknown";
          const areasForResearch = Array.isArray(parsedData.areasForResearch) ? parsedData.areasForResearch : [];
          const reasoning = parsedData.reasoning || "";
          const supportingPoints = Array.isArray(parsedData.supportingPoints) ? parsedData.supportingPoints : [];
          const negativePoints = Array.isArray(parsedData.negativePoints) ? parsedData.negativePoints : [];
          
          setStreamingState({
            rawText: JSON.stringify(parsedData, null, 2),
            parsedData: {
              probability,
              areasForResearch,
              reasoning,
              supportingPoints,
              negativePoints
            }
          });
          
          setProgress(prev => [...prev, `Extracted probability: ${probability}`]);
          if (reasoning) {
            setProgress(prev => [...prev, `Reasoning: ${reasoning}`]);
          }
          
          console.log(`Extracted probability: ${probability}`);
          console.log(`Areas for research: ${areasForResearch.length}`);
          
          await saveResearch();
        }
      } catch (error) {
        console.error("Error processing insights data:", error);
        setProgress(prev => [...prev, `Error processing insights: ${error.message}`]);
      }
    } catch (error) {
      console.error("Error in extractInsights:", error);
      setProgress(prev => [...prev, `Error extracting insights: ${error.message}`]);
    }
    
    setIsLoading(false);
    setIsAnalyzing(false);
  }

  const handleContinueResearch = (area: string) => {
    if (!streamingState.parsedData) return;
    
    setFocusText(area);
    
    const allQueries = iterations.flatMap(iter => iter.queries);
    const allAnalyses = iterations.map(iter => iter.analysis);
    
    setPreviousResearchContext({
      queries: allQueries,
      analyses: allAnalyses,
      probability: streamingState.parsedData.probability,
      supportingPoints: streamingState.parsedData.supportingPoints || [],
      negativePoints: streamingState.parsedData.negativePoints || []
    });
    
    saveResearch().then(() => {
      if (loadedResearchId) {
        setParentResearchId(loadedResearchId);
      }
      
      setLoadedResearchId(null);
      setResults([]);
      setAnalysis('');
      setIterations([]);
      setExpandedIterations(['iteration-1']);
      setStreamingState({
        rawText: '',
        parsedData: null
      });
      
      setIsLoading(true);
      setError(null);
      setProgress([
        `Starting focused research on: ${area}`,
        `Based on previous research with ${allQueries.length} queries and probability estimate: ${streamingState.parsedData.probability}`
      ]);
      
      const focusedQueries = [
        `${area} related to ${description}`,
        `${area} analysis ${marketId}`,
        `${area} details and updates`
      ];
      
      setCurrentQueries(focusedQueries);
      
      handleWebScrape(focusedQueries, 1, [])
        .catch(error => {
          console.error('Error in focused research process:', error);
          setError(`Focused research process failed: ${error.message}`);
          setIsLoading(false);
        });
    });
  };

  return (
    <Card className="mt-4">
      <div className="p-6 space-y-6">
        <ResearchHeader 
          isLoading={isLoading} 
          isAnalyzing={isAnalyzing} 
          onResearch={handleStartResearch}
          focusText={focusText}
          inFocusedMode={!!parentResearchId}
        />
        
        {parentResearch && (
          <div className="flex items-center gap-2 p-3 bg-secondary rounded-md mt-2 text-sm">
            <EventIcon type="branch" className="text-muted-foreground" />
            <div>
              <span className="text-muted-foreground">Focused research based on: </span>
              <Badge variant="outline" className="font-normal ml-1">
                {parentResearch.focus_text || 'Previous research'}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-2 h-7 text-xs"
                onClick={() => loadSavedResearch(parentResearch)}
              >
                <ArrowLeftCircle className="mr-1 h-3 w-3" />
                Back to parent
              </Button>
            </div>
          </div>
        )}
        
        {childResearchList.length > 0 && (
          <div className="flex flex-col gap-2 p-3 bg-secondary rounded-md mt-2 text-sm">
            <div className="flex items-center gap-2">
              <EventIcon type="branch" className="text-muted-foreground" />
              <span className="text-muted-foreground">Child research paths ({childResearchList.length}):</span>
            </div>
            <ScrollArea className="max-h-32">
              <div className="flex flex-wrap gap-2 mt-1">
                {childResearchList.map((child) => (
                  <Badge 
                    key={child.id} 
                    variant="outline" 
                    className="cursor-pointer hover:bg-accent transition-colors flex items-center gap-1"
                    onClick={() => loadSavedResearch(child)}
                  >
                    <EventIcon type="search" size={12} className="text-muted-foreground" />
                    {child.focus_text || 'Focused research'}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
        
        {progress.length > 0 && (
          <ProgressDisplay 
            messages={progress} 
          />
        )}
        
        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md">
            {error}
          </div>
        )}
        
        {results.length > 0 && (
          <SitePreviewList 
            results={results} 
          />
        )}
        
        {iterations.length > 0 && (
          <div className="space-y-4">
            {iterations.map((iter) => (
              <IterationCard
                key={`iteration-${iter.iteration}`}
                iteration={iter}
                isExpanded={expandedIterations.includes(`iteration-${iter.iteration}`)}
                onToggleExpand={() => {
                  setExpandedIterations(prev => {
                    const iterKey = `iteration-${iter.iteration}`;
                    return prev.includes(iterKey)
                      ? prev.filter(key => key !== iterKey)
                      : [...prev, iterKey]
                  })
                }}
                isStreaming={isLoading && currentIteration === iter.iteration}
                isCurrentIteration={currentIteration === iter.iteration}
                maxIterations={maxIterations}
              />
            ))}
          </div>
        )}
        
        {analysis && (
          <AnalysisDisplay 
            content={analysis} 
            isStreaming={isAnalyzing}
          />
        )}
        
        {streamingState.parsedData && (
          <InsightsDisplay 
            streamingState={streamingState} 
            onResearchArea={handleContinueResearch}
            parentResearch={parentResearch ? {
              id: parentResearch.id,
              focusText: parentResearch.focus_text,
              onView: () => loadSavedResearch(parentResearch)
            } : undefined}
            childResearches={childResearchList.length > 0 ? childResearchList.map(child => ({
              id: child.id,
              focusText: child.focus_text || 'Focused Research',
              onView: () => loadSavedResearch(child)
            })) : undefined}
          />
        )}
      </div>
    </Card>
  )
}
