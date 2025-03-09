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
    probability?: string
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
        probability: research.probability
      });
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
        probability: "Analyzing...",
        areasForResearch: ["Analysis in progress..."],
        reasoning: "Extracting insights from research data..."
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
          const areasForResearch = Array.isArray(parsedData.areasForResearch) && parsedData.areasForResearch.length > 0
            ? parsedData.areasForResearch
            : ["More data needed"];
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
          console.log(`Supporting points: ${supportingPoints.length}`);
          console.log(`Negative points: ${negativePoints.length}`);
          
          await saveResearch();
        } else {
          throw new Error("Failed to parse response data");
        }
      } catch (e) {
        console.error('Error processing insights response:', e);
        
        setStreamingState({
          rawText: JSON.stringify(insightsData || {}, null, 2),
          parsedData: {
            probability: "Unknown (parsing error)",
            areasForResearch: ["Could not parse research areas due to format error."],
            reasoning: "Error parsing model output."
          }
        });
        
        await saveResearch();
      }
    } catch (error) {
      console.error("Error in extractInsights:", error);
      setError(`Error extracting insights: ${error.message}`);
      
      setStreamingState({
        rawText: '',
        parsedData: {
          probability: "Unknown (error occurred)",
          areasForResearch: ["Error occurred during analysis", "Additional research needed"],
          reasoning: "An error occurred during analysis."
        }
      });
      
      await saveResearch();
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
      
      const defaultAreasForResearch = ["More research needed"];
      const sanitizedAreasForResearch = sanitizeJson(
        streamingState.parsedData?.areasForResearch && 
        Array.isArray(streamingState.parsedData.areasForResearch) && 
        streamingState.parsedData.areasForResearch.length > 0
          ? streamingState.parsedData.areasForResearch
          : defaultAreasForResearch
      );
      
      const sanitizedIterations = sanitizeJson(iterations);
      const sanitizedFocusText = focusText ? focusText.replace(/\u0000/g, '') : null;
      
      if (!Array.isArray(sanitizedAreasForResearch) || sanitizedAreasForResearch.length === 0) {
        console.error("Invalid areas_for_research after sanitization, using default");
        sanitizedAreasForResearch = defaultAreasForResearch;
      }
      
      console.log("Saving research with areas_for_research:", sanitizedAreasForResearch);
      
      const researchPayload = {
        user_id: user.user.id,
        query: description.replace(/\u0000/g, ''),
        sources: sanitizedResults as unknown as Json,
        analysis: sanitizedAnalysis,
        probability: streamingState.parsedData?.probability?.replace(/\u0000/g, '') || 'Unknown',
        areas_for_research: sanitizedAreasForResearch as unknown as Json,
        market_id: marketId,
        iterations: sanitizedIterations as unknown as Json,
        focus_text: sanitizedFocusText,
        parent_research_id: parentResearchId
      };

      console.log("Saving sanitized research data", parentResearchId ? `with parent research: ${parentResearchId}` : "without parent");
      const { data, error } = await supabase.from('web_research').insert(researchPayload).select('id')

      if (error) {
        console.error("Error saving research:", error);
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

  const handleWebScrape = async (queries: string[], iteration: number, previousContent: string[] = [], activeFocusText?: string) => {
    try {
      setProgress(prev => [...prev, `Starting iteration ${iteration} of ${maxIterations}...`])
      setCurrentIteration(iteration)
      setExpandedIterations(prev => [...prev, `iteration-${iteration}`])
      
      console.log(`Calling web-scrape function with queries for iteration ${iteration}:`, queries)
      console.log(`Market ID for web-scrape: ${marketId}`)
      console.log(`Market description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`)
      console.log(`Active focus text: ${activeFocusText || focusText || 'none'}`)
      
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

      const actualFocusText = activeFocusText?.trim() || focusText.trim();
      
      if (actualFocusText) {
        scrapePayload.focusText = actualFocusText;
        scrapePayload.researchFocus = actualFocusText;
        
        setProgress(prev => [...prev, `Conducting focused web research on: ${actualFocusText}`]);
        
        if (previousResearchContext) {
          scrapePayload.previousQueries = previousResearchContext.queries;
          scrapePayload.previousAnalyses = previousResearchContext.analyses;
          
          setProgress(prev => [...prev, 
            `Using context from ${previousResearchContext.queries.length} previous queries and ${previousResearchContext.analyses.length} analyses for focused research.`
          ]);
        }
        
        setProgress(prev => [...prev, `Focusing web research on: ${actualFocusText}`]);
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
        marketPrice: marketPrice
      };

      console.log(`Analyze payload for market ${marketId} includes marketPrice: ${marketPrice}`);

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
          const { data: refinedQueriesData, error: refinedQueriesError } = await supabase.functions.invoke('generate-queries', {
            body: JSON.stringify({ 
              query: description,
              previousResults: analysisContent,
              iteration: iteration,
              marketId: marketId,
              marketDescription: description,
              areasForResearch: streamingState.parsedData?.areasForResearch || [],
              previousAnalyses: iterations.map(iter => iter.analysis).join('\n\n'),
              focusText: focusText.trim()
            })
          })

          if (refinedQueriesError) {
            console.error("Error from generate-queries:", refinedQueriesError);
            throw new Error(`Error generating refined queries: ${refinedQueriesError.message}`)
          }

          if (!refinedQueriesData?.queries || !Array.isArray(refinedQueriesData.queries)) {
            console.error("Invalid refined queries response:", refinedQueriesData);
            throw new Error('Invalid refined queries response')
          }

          console.log(`Generated refined queries for iteration ${iteration + 1}:`, refinedQueriesData.queries)
          setProgress(prev => [...prev, `Generated ${refinedQueriesData.queries.length} refined search queries for iteration ${iteration + 1}`])
          
          setCurrentQueries(refinedQueriesData.queries);
          setCurrentQueryIndex(-1);
          
          refinedQueriesData.queries.forEach((query: string, index: number) => {
            setProgress(prev => [...prev, `Refined Query ${index + 1}: "${query}"`])
          })

          await handleWebScrape(refinedQueriesData.queries, iteration + 1, [...allContent])
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

  const handleResearch = async (specificFocusText?: string) => {
    setLoadedResearchId(null);
    
    setIsLoading(true)
    setProgress([])
    setResults([])
    setError(null)
    setAnalysis('')
    setIsAnalyzing(false)
    setStreamingState({ 
      rawText: '',
      parsedData: {
        probability: "Researching...",
        areasForResearch: ["Research in progress..."],
        reasoning: "Starting research process..."
      }
    })
    
    setCurrentIteration(0)
    setIterations([])
    
    const actualFocusText = specificFocusText || focusText
    if (specificFocusText) {
      setFocusText(specificFocusText)
    }
    
    console.log(`Starting research with focus text: "${actualFocusText || 'none'}"`)
    
    try {
      const initialQueries = [`${description.substring(0, 150)}`]
      
      if (actualFocusText) {
        initialQueries.unshift(`${actualFocusText}`)
        initialQueries.push(`${actualFocusText} latest information`)
      }
      
      setCurrentQueries(initialQueries)
      setCurrentQueryIndex(-1)
      
      if (parentResearchId) {
        const parent = findParentResearch(parentResearchId)
        if (parent) {
          setPreviousResearchContext({
            queries: parent.iterations?.flatMap(iter => iter.queries || []) || [],
            analyses: parent.iterations?.map(iter => iter.analysis || '') || [],
            probability: parent.probability
          })
          
          console.log(`Loaded context from parent research: ${parentResearchId}`)
        }
      }
      
      await handleWebScrape(initialQueries, 1, [], actualFocusText)
    } catch (error) {
      console.error("Error starting research:", error)
      setError(`Error starting research: ${error.message}`)
      setIsLoading(false)
      
      setStreamingState({
        rawText: '',
        parsedData: {
          probability: "Unknown (error occurred)",
          areasForResearch: ["Error occurred during research", "Try different search terms"],
          reasoning: "An error occurred during the research process."
        }
      });
    }
  }
  
  const handleResearchArea = (area: string) => {
    if (loadedResearchId) {
      setParentResearchId(loadedResearchId)
    }
    
    handleResearch(area)
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 space-y-4">
        <ResearchHeader 
          isLoading={isLoading} 
          isAnalyzing={isAnalyzing} 
          onResearch={() => handleResearch()} 
          focusText={focusText}
          error={error}
        />

        <div className="space-y-2">
          {(progress.length > 0 || error) && (
            <ProgressDisplay 
              messages={progress} 
              currentIteration={currentIteration} 
              maxIterations={maxIterations}
              currentQueryIndex={currentQueryIndex}
              queries={currentQueries}
              isLoading={isLoading || isAnalyzing}
              error={error}
            />
          )}
          
          {error && (
            <div className="text-sm p-2 bg-destructive/10 text-destructive rounded">
              {error}
            </div>
          )}
                  
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Research Results</h4>
                <span className="text-xs text-muted-foreground">{results.length} sources</span>
              </div>
              
              <SitePreviewList results={results} />
            </div>
          )}
        </div>
        
        {analysis && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Analysis</h4>
            <AnalysisDisplay content={analysis} />
          </div>
        )}
        
        {streamingState.parsedData && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Key Insights</h4>
            <InsightsDisplay 
              streamingState={streamingState}
              onResearchArea={handleResearchArea}
            />
          </div>
        )}
        
        {iterations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Research Iterations</h4>
            <div className="space-y-2">
              {iterations.map(iteration => (
                <IterationCard
                  key={`iteration-${iteration.iteration}`}
                  iteration={iteration}
                  isExpanded={expandedIterations.includes(`iteration-${iteration.iteration}`)}
                  onToggleExpand={() => {
                    setExpandedIterations(prev => {
                      const id = `iteration-${iteration.iteration}`
                      if (prev.includes(id)) {
                        return prev.filter(i => i !== id)
                      } else {
                        return [...prev, id]
                      }
                    })
                  }}
                  isStreaming={isLoading || isAnalyzing}
                  isCurrentIteration={iteration.iteration === currentIteration}
                  maxIterations={maxIterations}
                />
              ))}
            </div>
          </div>
        )}
        
        {savedResearch && savedResearch.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Research History</h4>
            <div className="space-y-2">
              <ScrollArea className="h-[200px]">
                {savedResearch.map(research => (
                  <div 
                    key={research.id} 
                    className={`
                      p-2 text-xs rounded flex items-center justify-between cursor-pointer
                      ${loadedResearchId === research.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted'}
                    `}
                    onClick={() => {
                      if (!isLoading && !isAnalyzing) {
                        loadSavedResearch(research)
                      }
                    }}
                  >
                    <div className="flex flex-col">
                      <div className="font-medium">
                        {research.focus_text || 'General Research'}
                        {research.id === loadedResearchId && ' (Current)'}
                      </div>
                      <div className="text-muted-foreground">
                        {format(new Date(research.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                      {research.probability && (
                        <div className={`
                          text-xs mt-1 
                          ${research.probability.includes('high') ? 'text-green-500' : 
                           research.probability.includes('low') ? 'text-red-500' : 'text-amber-500'}
                        `}>
                          {research.probability}
                        </div>
                      )}
                    </div>
                    {isLoadingSaved && loadedResearchId === research.id ? (
                      <div className="animate-spin h-3 w-3 border border-primary rounded-full border-t-transparent"></div>
                    ) : (
                      <div className="flex gap-1">
                        {(research.parent_research_id || childResearchList.some(r => r.parent_research_id === research.id)) && (
                          <Badge variant="outline" className="text-[10px]">
                            {research.parent_research_id ? 'Child' : 'Parent'}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
        )}
        
        {(parentResearch || childResearchList.length > 0) && loadedResearchId && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Research Context</h4>
            
            {parentResearch && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Parent Research:</div>
                <div 
                  className="p-2 text-xs rounded flex items-center justify-between cursor-pointer bg-muted hover:bg-muted/80"
                  onClick={() => {
                    if (!isLoading && !isAnalyzing) {
                      loadSavedResearch(parentResearch)
                    }
                  }}
                >
                  <div className="flex flex-col">
                    <div className="font-medium">
                      {parentResearch.focus_text || 'General Research'}
                    </div>
                    <div className="text-muted-foreground">
                      {format(new Date(parentResearch.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                  <ArrowLeftCircle className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            )}
            
            {childResearchList.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Child Research:</div>
                {childResearchList.map(child => (
                  <div 
                    key={child.id} 
                    className="p-2 text-xs rounded flex items-center justify-between cursor-pointer bg-muted hover:bg-muted/80"
                    onClick={() => {
                      if (!isLoading && !isAnalyzing) {
                        loadSavedResearch(child)
                      }
                    }}
                  >
                    <div className="flex flex-col">
                      <div className="font-medium">
                        {child.focus_text || 'General Research'}
                      </div>
                      <div className="text-muted-foreground">
                        {format(new Date(child.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      Focus: {child.focus_text?.substring(0, 15)}{child.focus_text && child.focus_text.length > 15 ? '...' : ''}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="pt-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full flex items-center justify-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Research Settings</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium">Research Settings</h4>
                
                <div className="space-y-2">
                  <label className="text-sm">Max Iterations: {maxIterations}</label>
                  <Slider
                    value={[maxIterations]}
                    min={1}
                    max={5}
                    step={1}
                    onValueChange={(value) => setMaxIterations(value[0])}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm">Research Focus (Optional)</label>
                  <div className="flex gap-2">
                    <Input
                      value={focusText}
                      onChange={(e) => setFocusText(e.target.value)}
                      placeholder="Enter specific focus area..."
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setFocusText('')}
                      disabled={!focusText}
                    >
                      &times;
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </Card>
  )
}
