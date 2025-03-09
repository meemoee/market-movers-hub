
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
import { ChevronDown, Settings, Search, ArrowLeftCircle, GitBranch } from 'lucide-react'
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

interface ResearchInsights {
  probability: string;
  areasForResearch: string[];
  supportingPoints?: string[];
  negativePoints?: string[];
  reasoning?: string;
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
  const [isSaving, setIsSaving] = useState(false)
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

  // Modified saveResearch function to accept insights data directly
  const saveResearch = async (insightsData?: ResearchInsights) => {
    if (isSaving) {
      console.log("Already saving, skipping duplicate save request");
      return;
    }
    
    setIsSaving(true);
    
    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) {
        throw new Error('Not authenticated')
      }

      if (isLoadingSaved) {
        console.log("Skipping save because research is currently being loaded");
        setIsSaving(false);
        return;
      }
      
      if (loadedResearchId && savedResearch?.some(r => r.id === loadedResearchId)) {
        console.log(`Skipping save for already existing research with ID: ${loadedResearchId}`);
        setIsSaving(false);
        return;
      }

      // Use insights data passed directly or fall back to state
      const effectiveInsights = insightsData || streamingState.parsedData;
      
      if (!effectiveInsights?.areasForResearch || !Array.isArray(effectiveInsights.areasForResearch)) {
        console.log("Cannot save: areasForResearch is not available or not an array", effectiveInsights);
        setIsSaving(false);
        return;
      }

      console.log("Saving research with insights:", effectiveInsights);

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
      const sanitizedAreasForResearch = sanitizeJson(effectiveInsights.areasForResearch);
      const sanitizedIterations = sanitizeJson(iterations);
      const sanitizedFocusText = focusText ? focusText.replace(/\u0000/g, '') : null;
      
      // Ensure areasForResearch is a non-empty array
      if (!Array.isArray(sanitizedAreasForResearch) || sanitizedAreasForResearch.length === 0) {
        console.log("Cannot save: sanitizedAreasForResearch is not a valid array", sanitizedAreasForResearch);
        sanitizedAreasForResearch.push("Further research needed");
      }
      
      const researchPayload = {
        user_id: user.user.id,
        query: description.replace(/\u0000/g, ''),
        sources: sanitizedResults as unknown as Json,
        analysis: sanitizedAnalysis,
        probability: effectiveInsights.probability?.replace(/\u0000/g, '') || 'Unknown',
        areas_for_research: sanitizedAreasForResearch as unknown as Json,
        market_id: marketId,
        iterations: sanitizedIterations as unknown as Json,
        focus_text: sanitizedFocusText,
        parent_research_id: parentResearchId
      };

      console.log("Saving research data with payload:", {
        sources: sanitizedResults.length,
        analysis_length: sanitizedAnalysis.length,
        probability: researchPayload.probability,
        areas_for_research: sanitizedAreasForResearch.length,
        parent_research_id: parentResearchId || 'none'
      });
      
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
    } finally {
      setIsSaving(false);
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
        probability: "Processing...",
        areasForResearch: ["Analyzing research areas..."],
        reasoning: "Processing insights..."
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
          
          // Create a fresh copy of insights for immediate saving
          const insightsForSaving: ResearchInsights = {
            probability,
            areasForResearch: areasForResearch.length > 0 ? areasForResearch : ["Further research needed"],
            supportingPoints,
            negativePoints,
            reasoning
          };
          
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
          
          // Log the extracted data for debugging
          console.log("Extracted probability:", probability);
          console.log("Areas for research:", areasForResearch.length);
          console.log("Supporting points:", supportingPoints.length);
          console.log("Negative points:", negativePoints.length);
          
          // Save research using the direct insights data rather than waiting for state updates
          await saveResearch(insightsForSaving);
          
          setIsLoading(false);
          setIsAnalyzing(false);
        }
      } catch (e) {
        console.error("Error processing insights response:", e);
        setError(`Error processing insights: ${e.message}`);
        
        // Still try to save with whatever data we have
        if (insightsData.probability) {
          await saveResearch({
            probability: insightsData.probability,
            areasForResearch: Array.isArray(insightsData.areasForResearch) ? insightsData.areasForResearch : ["Further research needed"],
            reasoning: insightsData.reasoning || ""
          });
        }
        
        setIsLoading(false);
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error("Error extracting insights:", error);
      setError(`Error extracting insights: ${error.message}`);
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  };

  const handleStartResearch = () => {
    setIsLoading(true)
    setError(null)
    setResults([])
    setAnalysis('')
    setIterations([])
    setProgress([])
    setStreamingState({
      rawText: '',
      parsedData: null
    })
    setExpandedIterations(['iteration-1'])
    setParentResearchId(null)
    setLoadedResearchId(null)
    
    const initialQueries = [
      description,
      `${description} analysis`,
      `${description} probability`
    ];
    
    setProgress([`Starting web research on: ${description}`])
    
    handleWebScrape(initialQueries, 1)
  }

  const handleFocusedResearch = () => {
    if (!focusText.trim()) {
      toast({
        title: "Focus text required",
        description: "Please enter a specific area to focus your research on.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true)
    setError(null)
    setResults([])
    setAnalysis('')
    setIterations([])
    setProgress([])
    setStreamingState({
      rawText: '',
      parsedData: null
    })
    setExpandedIterations(['iteration-1'])
    
    // If we have a loaded research, set it as the parent for this new focused research
    if (loadedResearchId) {
      setParentResearchId(loadedResearchId)
    }
    
    // Clear the loaded research ID so we can save this as a new research item
    setLoadedResearchId(null)
    
    // Generate focused queries
    const focusedQueries = [
      focusText.trim(),
      `${focusText.trim()} analysis`,
      `${focusText.trim()} evidence`,
      `${description} ${focusText.trim()}`
    ];
    
    setProgress([
      `Starting focused web research on: ${focusText.trim()}`,
      `Core market question: ${description}`,
    ]);
    
    handleWebScrape(focusedQueries, 1, [], focusText.trim());
  }

  const renderResearchActions = () => {
    if (isLoading) {
      return (
        <Button variant="outline" disabled>
          <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          Research in progress...
        </Button>
      )
    }

    if (savedResearch && savedResearch.length > 0) {
      return (
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex gap-1 items-center">
                <Search size={16} />
                Load Research
                <ChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72">
              <DropdownMenuLabel>Saved Research</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <ScrollArea className="h-[300px]">
                {savedResearch.map(research => (
                  <DropdownMenuItem 
                    key={research.id} 
                    className="flex flex-col items-start p-3 border-b cursor-pointer"
                    onClick={() => loadSavedResearch(research)}
                  >
                    <div className="flex w-full justify-between items-center gap-2">
                      <span className="font-medium text-sm truncate max-w-[220px]">
                        {research.focus_text ? research.focus_text : 'General research'}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {research.probability || 'N/A'}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">
                      {format(new Date(research.created_at), 'MMM d, h:mm a')}
                    </span>
                    {research.parent_research_id && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <GitBranch size={10} />
                        <span>Focused research</span>
                      </div>
                    )}
                  </DropdownMenuItem>
                ))}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="default" onClick={handleStartResearch}>
            <Search size={16} className="mr-2" />
            New Research
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Settings size={16} className="mr-2" />
                Settings
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium">Research Settings</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm">Max Iterations: {maxIterations}</label>
                    <span className="text-sm text-muted-foreground">{maxIterations}</span>
                  </div>
                  <Slider
                    defaultValue={[maxIterations]}
                    max={5}
                    min={1}
                    step={1}
                    onValueChange={(values) => setMaxIterations(values[0])}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )
    }

    return (
      <div className="flex gap-2">
        <Button variant="default" onClick={handleStartResearch}>
          <Search size={16} className="mr-2" />
          Research this Market
        </Button>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Settings size={16} className="mr-2" />
              Settings
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <h4 className="font-medium">Research Settings</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm">Max Iterations: {maxIterations}</label>
                  <span className="text-sm text-muted-foreground">{maxIterations}</span>
                </div>
                <Slider
                  defaultValue={[maxIterations]}
                  max={5}
                  min={1}
                  step={1}
                  onValueChange={(values) => setMaxIterations(values[0])}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  return (
    <Card className="p-4 w-full relative overflow-hidden">
      <ResearchHeader 
        description={description} 
        marketId={marketId}
        marketPrice={marketPrice}
      />

      {/* Research Actions */}
      <div className="mt-4 space-y-4">
        {renderResearchActions()}
  
        {parentResearch && (
          <div className="mt-2 flex items-center gap-1">
            <ArrowLeftCircle size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Focused research from: {parentResearch.focus_text || 'General research'}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs" 
              onClick={() => loadSavedResearch(parentResearch)}
            >
              View parent
            </Button>
          </div>
        )}
        
        {/* Focus Research Input */}
        {(loadedResearchId || isAnalyzing || results.length > 0) && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Focus research on a specific aspect..."
                value={focusText}
                onChange={(e) => setFocusText(e.target.value)}
                disabled={isLoading}
              />
              <Button 
                variant="secondary" 
                disabled={isLoading || !focusText.trim()} 
                onClick={handleFocusedResearch}
              >
                Focus
              </Button>
            </div>
            
            {childResearchList.length > 0 && (
              <div className="mt-1">
                <span className="text-xs text-muted-foreground">Related focused research:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {childResearchList.map(child => (
                    <Badge 
                      key={child.id} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => loadSavedResearch(child)}
                    >
                      {child.focus_text || 'Focused research'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress Display */}
      {(isLoading || progress.length > 0) && (
        <div className="mt-4">
          <ProgressDisplay 
            messages={progress} 
            isLoading={isLoading} 
            currentProgress={currentQueryIndex !== -1 ? (currentQueryIndex + 1) / (currentQueries.length || 1) : 0}
            currentQuery={currentQueryIndex !== -1 ? currentQueries[currentQueryIndex] : null}
            queries={currentQueries}
            currentIteration={currentIteration}
            maxIterations={maxIterations}
          />
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md">
          {error}
        </div>
      )}

      {/* Results Display */}
      {results.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Web Sources ({results.length})</h3>
          <SitePreviewList results={results} />
        </div>
      )}

      {/* Analysis Display */}
      {analysis && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Analysis</h3>
          <AnalysisDisplay content={analysis} />
        </div>
      )}

      {/* Iterations */}
      {iterations.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Research Iterations</h3>
          <div className="space-y-2">
            {iterations.map((iteration) => (
              <IterationCard
                key={`iteration-${iteration.iteration}`}
                iteration={iteration}
                isExpanded={expandedIterations.includes(`iteration-${iteration.iteration}`)}
                onToggle={() => {
                  setExpandedIterations(prev => {
                    const id = `iteration-${iteration.iteration}`;
                    if (prev.includes(id)) {
                      return prev.filter(item => item !== id);
                    } else {
                      return [...prev, id];
                    }
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Insights Display */}
      {streamingState.parsedData && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Insights</h3>
          <InsightsDisplay
            probability={streamingState.parsedData.probability}
            areasForResearch={streamingState.parsedData.areasForResearch}
            supportingPoints={streamingState.parsedData.supportingPoints}
            negativePoints={streamingState.parsedData.negativePoints}
            reasoning={streamingState.parsedData.reasoning}
          />
        </div>
      )}
    </Card>
  )
}
