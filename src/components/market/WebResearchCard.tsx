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
      const insightsResponse = await supabase.functions.invoke('extract-research-insights', {
        body: insightsPayload
      });

      if (insightsResponse.error) {
        console.error("Error from extract-research-insights:", insightsResponse.error);
        throw new Error(insightsResponse.error.message || "Error extracting insights");
      }

      console.log("Received response from extract-research-insights");

      const textDecoder = new TextDecoder();
      const reader = new Response(insightsResponse.data.body).body?.getReader();
      
      if (!reader) {
        throw new Error('Failed to get reader from insights response');
      }
      
      let jsonContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log("Insights stream complete");
          
          try {
            let finalJson = jsonContent;
            if (finalJson.startsWith('```json')) {
              finalJson = finalJson.replace(/^```json\n/, '').replace(/```$/, '');
            } else if (finalJson.startsWith('```')) {
              finalJson = finalJson.replace(/^```\n/, '').replace(/```$/, '');
            }
            
            const parsedJson = JSON.parse(finalJson);
            
            setStreamingState({
              rawText: finalJson,
              parsedData: {
                probability: parsedJson.probability || "Unknown",
                areasForResearch: Array.isArray(parsedJson.areasForResearch) ? parsedJson.areasForResearch : [],
                reasoning: parsedJson.reasoning || ""
              }
            });
            
            setProgress(prev => [...prev, `Extracted probability: ${parsedJson.probability || "Unknown"}`]);
            if (parsedJson.reasoning) {
              setProgress(prev => [...prev, `Reasoning: ${parsedJson.reasoning}`]);
            }
          } catch (e) {
            console.error('Final JSON parsing error:', e);
            
            setStreamingState({
              rawText: jsonContent,
              parsedData: {
                probability: "Unknown (parsing error)",
                areasForResearch: ["Could not parse research areas due to format error."],
                reasoning: "Error parsing model output."
              }
            });
          }
          
          break;
        }
        
        const chunk = textDecoder.decode(value);
        
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            
            try {
              const { content } = cleanStreamContent(jsonStr);
              if (content) {
                jsonContent += content;
              }
            } catch (e) {
              console.debug('Error parsing insights SSE data (expected during streaming):', e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in extractInsights:", error);
      setError(`Error extracting insights: ${error.message}`);
      
      setStreamingState({
        rawText: '',
        parsedData: {
          probability: "Unknown (error occurred)",
          areasForResearch: ["Error occurred during analysis"],
          reasoning: "An error occurred during analysis."
        }
      });
    }
  };

  const handleResearch = async () => {
    setLoadedResearchId(null);
    
    setIsLoading(true)
    setProgress([])
    setResults([])
    setError(null)
    setAnalysis('')
    setIsAnalyzing(false)
    setStreamingState({ rawText: '', parsedData: null })
    setCurrentIteration(0)
    setIterations([])
    setExpandedIterations(['iteration-1'])
    setCurrentQueries([])
    setCurrentQueryIndex(-1)

    try {
      setProgress(prev => [...prev, "Starting iterative web research..."])
      setProgress(prev => [...prev, `Researching market: ${marketId}`])
      setProgress(prev => [...prev, `Market question: ${description}`])
      
      if (focusText.trim()) {
        setProgress(prev => [...prev, `Research focus: ${focusText.trim()}`])
      }
      
      setProgress(prev => [...prev, "Generating initial search queries..."])

      try {
        console.log("Calling generate-queries with:", { 
          description, 
          marketId,
          descriptionLength: description ? description.length : 0,
          focusText: focusText.trim() || null
        });
        
        const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
          body: JSON.stringify({ 
            query: description,
            marketId: marketId,
            marketDescription: description,
            question: description,
            iteration: 1,
            focusText: focusText.trim()
          })
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
        
        console.log("Generated clean queries:", cleanQueries)
        setProgress(prev => [...prev, `Generated ${cleanQueries.length} search queries`])
        
        setCurrentQueries(cleanQueries);
        
        cleanQueries.forEach((query: string, index: number) => {
          setProgress(prev => [...prev, `Query ${index + 1}: "${query}"`])
        });

        await handleWebScrape(cleanQueries, 1);
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
        await handleWebScrape(fallbackQueries, 1);
      }

      setProgress(prev => [...prev, "Research complete!"])

    } catch (error) {
      console.error('Error in web research:', error)
      setError(`Error occurred during research: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
      setIsAnalyzing(false)
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
    
    setTimeout(() => {
      handleResearch();
    }, 200);
  };

  const handleViewChildResearch = useCallback((childResearch: SavedResearch) => {
    if (childResearch) {
      loadSavedResearch(childResearch);
    }
  }, []);

  const handleViewParentResearch = useCallback(() => {
    if (parentResearch) {
      loadSavedResearch(parentResearch);
    }
  }, [parentResearch]);

  const canSave = !isLoading && !isAnalyzing && results.length > 0 && analysis && streamingState.parsedData

  useEffect(() => {
    const shouldAutoSave = !isLoading && 
                          !isAnalyzing && 
                          !isLoadingSaved &&
                          results.length > 0 && 
                          analysis && 
                          streamingState.parsedData &&
                          !error &&
                          !loadedResearchId;

    if (shouldAutoSave) {
      saveResearch();
    }
  }, [isLoading, isAnalyzing, results.length, analysis, streamingState.parsedData, error, isLoadingSaved, loadedResearchId]);

  const toggleIterationExpand = (iterationId: string) => {
    setExpandedIterations(prev => {
      if (prev.includes(iterationId)) {
        return prev.filter(id => id !== iterationId);
      } else {
        return [...prev, iterationId];
      }
    });
  };

  const renderQueryDisplay = () => {
    if (!currentQueries.length) return null;
    
    return (
      <div className="mb-4 border rounded-md p-4 bg-accent/5">
        <h4 className="text-sm font-medium mb-2">
          Current Queries (Iteration {currentIteration || 1})
        </h4>
        <div className="space-y-2">
          {currentQueries.map((query, index) => (
            <div 
              key={index} 
              className={`flex items-center gap-2 p-2 rounded-md text-sm ${
                currentQueryIndex === index ? 'bg-primary/10 border border-primary/30' : 'border border-transparent'
              }`}
            >
              {currentQueryIndex === index && (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
              <span className={currentQueryIndex === index ? 'font-medium' : ''}>
                {index + 1}. {query}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderIterations = () => {
    if (!iterations.length) return null;
    
    return (
      <div className="space-y-2 w-full max-w-full">
        {iterations.map((iter) => (
          <IterationCard
            key={`iteration-${iter.iteration}`}
            iteration={iter}
            isExpanded={expandedIterations.includes(`iteration-${iter.iteration}`)}
            onToggleExpand={() => toggleIterationExpand(`iteration-${iter.iteration}`)}
            isStreaming={isAnalyzing}
            isCurrentIteration={iter.iteration === currentIteration}
            maxIterations={maxIterations}
          />
        ))}
      </div>
    );
  };

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      {parentResearch && (
        <div className="flex items-center gap-2 text-sm p-2 bg-accent/20 rounded-md mb-2 w-full max-w-full">
          <ArrowLeftCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Derived from previous research:</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-xs hover:bg-accent"
            onClick={handleViewParentResearch}
          >
            {parentResearch.focus_text || 'View parent research'}
          </Button>
          {focusText && (
            <Badge variant="outline" className="ml-auto truncate max-w-[150px]">
              Focus: {focusText}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center justify-between w-full max-w-full">
        <ResearchHeader 
          isLoading={isLoading}
          isAnalyzing={isAnalyzing}
          onResearch={handleResearch}
        />
        
        <div className="flex space-x-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Research Settings</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Number of Iterations</span>
                    <span className="text-sm font-medium">{maxIterations}</span>
                  </div>
                  <Slider
                    value={[maxIterations]}
                    min={1}
                    max={5}
                    step={1}
                    onValueChange={(values) => setMaxIterations(values[0])}
                    disabled={isLoading || isAnalyzing}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher values will provide more thorough research but take longer to complete.
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          {savedResearch && savedResearch.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Saved Research <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px]">
                <DropdownMenuLabel>Your Saved Research</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedResearch.map((research) => (
                  <DropdownMenuItem 
                    key={research.id}
                    onClick={() => loadSavedResearch(research)}
                    className="flex flex-col items-start"
                  >
                    <div className="font-medium truncate w-full">
                      {research.focus_text ? (
                        <span className="flex items-center gap-1">
                          {research.parent_research_id && <ArrowLeftCircle className="h-3 w-3 text-muted-foreground" />}
                          <span>{research.focus_text}</span>
                        </span>
                      ) : (
                        research.query.substring(0, 40) + (research.query.length > 40 ? '...' : '')
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(research.created_at), 'MMM d, yyyy HH:mm')}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 w-full max-w-full">
        <div className="relative flex-1">
          <Input
            placeholder="Enter specific research focus (optional)..."
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            disabled={isLoading || isAnalyzing}
            className="pr-8"
          />
          {focusText && (
            <button
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setFocusText('')}
              disabled={isLoading || isAnalyzing}
            >
              ×
            </button>
          )}
        </div>
        {focusText && (
          <div className="shrink-0">
            <Badge variant="outline" className="whitespace-nowrap">
              <Search className="h-3 w-3 mr-1" />
              Focus: {focusText.length > 20 ? focusText.substring(0, 20) + '...' : focusText}
            </Badge>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/50 p-2 rounded w-full max-w-full">
          {error}
        </div>
      )}

      {currentIteration > 0 && (
        <div className="w-full bg-accent/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full transition-all duration-500 ease-in-out"
            style={{ width: `${(currentIteration / maxIterations) * 100}%` }}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Iteration {currentIteration} of {maxIterations}</span>
            <span>{Math.round((currentIteration / maxIterations) * 100)}% complete</span>
          </div>
        </div>
      )}

      {(isLoading || isAnalyzing) && renderQueryDisplay()}

      <ProgressDisplay messages={progress} />
      
      {iterations.length > 0 && (
        <div className="border rounded-md overflow-hidden w-full max-w-full">
          <ScrollArea className={maxIterations > 3 ? "h-[400px]" : "max-h-full"}>
            {renderIterations()}
          </ScrollArea>
        </div>
      )}
      
      <InsightsDisplay 
        streamingState={streamingState} 
        onResearchArea={handleResearchArea}
        parentResearch={parentResearchId && parentResearch ? {
          id: parentResearch.id,
          focusText: focusText || undefined,
          onView: handleViewParentResearch
        } : undefined}
        childResearches={childResearchList.length > 0 ? childResearchList.map(child => ({
          id: child.id,
          focusText: child.focus_text || 'Unknown focus',
          onView: () => handleViewChildResearch(child)
        })) : undefined}
      />

      {results.length > 0 && !iterations.length && (
        <>
          <div className="border-t pt-4 w-full max-w-full">
            <h3 className="text-lg font-medium mb-2">Search Results</h3>
            <SitePreviewList results={results} />
          </div>
          
          {analysis && (
            <div className="border-t pt-4 w-full max-w-full">
              <h3 className="text-lg font-medium mb-2">Analysis</h3>
              <AnalysisDisplay content={analysis} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
