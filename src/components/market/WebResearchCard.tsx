
import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { InsightsDisplay } from "./insights/InsightsDisplay"
import { ChevronDown, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useToast } from "@/components/ui/use-toast"
import { Json } from '@/integrations/supabase/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface WebResearchCardProps {
  description: string;
  marketId: string;
}

export interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
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
        iterations: item.iterations as ResearchIteration[] || []
      })) as SavedResearch[]
    }
  })

  const loadSavedResearch = (research: SavedResearch) => {
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

      const { error } = await supabase.from('web_research').insert({
        user_id: user.user.id,
        query: description,
        sources: results as unknown as Json,
        analysis,
        probability: streamingState.parsedData?.probability || '',
        areas_for_research: streamingState.parsedData?.areasForResearch as unknown as Json,
        market_id: marketId,
        iterations: iterations as unknown as Json
      })

      if (error) throw error

      toast({
        title: "Research saved",
        description: "Your research has been saved automatically.",
      })

      refetchSavedResearch()
    } catch (error) {
      console.error('Error saving research:', error)
      toast({
        title: "Error",
        description: "Failed to save research automatically. Please try again.",
        variant: "destructive"
      })
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
      
      const analysisResponse = await supabase.functions.invoke('analyze-web-content', {
        body: JSON.stringify({ 
          content: allContent.join('\n\n'),
          query: description,
          question: description,
          marketId: marketId,
          marketDescription: description,
          previousAnalyses: iterations.map(iter => iter.analysis).join('\n\n'),
          areasForResearch: streamingState.parsedData?.areasForResearch || []
        })
      })

      if (analysisResponse.error) {
        console.error("Error from analyze-web-content:", analysisResponse.error)
        throw analysisResponse.error
      }

      console.log("Received response from analyze-web-content")

      let accumulatedContent = '';
      let iterationAnalysis = ''; // For storing in the iterations array
      
      // Create an empty iteration entry immediately so streaming updates work properly
      setIterations(prev => {
        const updatedIterations = [...prev];
        const currentIterIndex = updatedIterations.findIndex(i => i.iteration === iteration);
        
        if (currentIterIndex >= 0) {
          // Update existing iteration if it exists
          updatedIterations[currentIterIndex] = {
            ...updatedIterations[currentIterIndex],
            analysis: "" // Initialize with empty analysis
          };
        } else {
          // Add new iteration if it doesn't exist
          updatedIterations.push({
            iteration,
            queries: currentQueries,
            results: iterationResults,
            analysis: "" // Initialize with empty analysis
          });
        }
        
        return updatedIterations;
      });
      
      const processAnalysisStream = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
        const textDecoder = new TextDecoder()
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            console.log("Analysis stream complete")
            break
          }
          
          const chunk = textDecoder.decode(value)
          console.log("Received analysis chunk of size:", chunk.length)
          
          buffer += chunk
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim()
              if (jsonStr === '[DONE]') continue
              
              try {
                const { content } = cleanStreamContent(jsonStr)
                if (content) {
                  console.log("Received content chunk:", content.substring(0, 50) + "...")
                  accumulatedContent += content;
                  iterationAnalysis += content; // Save for iterations array too
                  
                  // Update both the main analysis state and the iterations array in real-time
                  setAnalysis(accumulatedContent);
                  
                  // Store the current iteration analysis in real-time
                  setIterations(prev => {
                    const updatedIterations = [...prev];
                    const currentIterIndex = updatedIterations.findIndex(i => i.iteration === iteration);
                    
                    if (currentIterIndex >= 0) {
                      // Update existing iteration
                      updatedIterations[currentIterIndex] = {
                        ...updatedIterations[currentIterIndex],
                        analysis: iterationAnalysis
                      };
                    }
                    
                    return updatedIterations;
                  });
                  
                  // Make sure the iteration is expanded when streaming analysis
                  if (!expandedIterations.includes(`iteration-${iteration}`)) {
                    setExpandedIterations(prev => [...prev, `iteration-${iteration}`]);
                  }
                }
              } catch (e) {
                console.error('Error parsing analysis SSE data:', e)
              }
            }
          }
        }

        return accumulatedContent;
      }

      const analysisReader = new Response(analysisResponse.data.body).body?.getReader()
      
      if (!analysisReader) {
        throw new Error('Failed to get reader from analysis response')
      }
      
      const currentAnalysis = await processAnalysisStream(analysisReader)
      
      // Final update to the iterations array with the complete analysis
      setIterations(prev => {
        const updatedIterations = [...prev];
        const currentIterIndex = updatedIterations.findIndex(i => i.iteration === iteration);
        
        if (currentIterIndex >= 0) {
          // Update existing iteration
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
        setProgress(prev => [...prev, "Final analysis complete, extracting key insights..."])
        await extractInsights(allContent, currentAnalysis)
      } else {
        setProgress(prev => [...prev, "Generating new queries based on analysis..."])
        
        try {
          const { data: refinedQueriesData, error: refinedQueriesError } = await supabase.functions.invoke('generate-queries', {
            body: JSON.stringify({ 
              query: description,
              previousResults: currentAnalysis,
              iteration: iteration,
              marketId: marketId,
              marketDescription: description,
              areasForResearch: streamingState.parsedData?.areasForResearch || [],
              previousAnalyses: iterations.map(iter => iter.analysis).join('\n\n')
            })
          })

          if (refinedQueriesError) {
            console.error("Error from generate-queries:", refinedQueriesError)
            throw new Error(`Error generating refined queries: ${refinedQueriesError.message}`)
          }

          if (!refinedQueriesData?.queries || !Array.isArray(refinedQueriesData.queries)) {
            console.error("Invalid refined queries response:", refinedQueriesData)
            throw new Error('Invalid refined queries response')
          }

          console.log(`Generated refined queries for iteration ${iteration + 1}:`, refinedQueriesData.queries)
          setProgress(prev => [...prev, `Generated ${refinedQueriesData.queries.length} refined search queries for iteration ${iteration + 1}`])
          
          // Display new queries immediately and set them as current
          setCurrentQueries(refinedQueriesData.queries);
          setCurrentQueryIndex(-1);
          
          refinedQueriesData.queries.forEach((query: string, index: number) => {
            setProgress(prev => [...prev, `Refined Query ${index + 1}: "${query}"`])
          })

          await handleWebScrape(refinedQueriesData.queries, iteration + 1, [...allContent])
        } catch (error) {
          console.error("Error generating refined queries:", error)
          
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

      return currentAnalysis
    } catch (error) {
      console.error("Error in processQueryResults:", error);
      setError(`Error analyzing content: ${error.message}`);
      setIsAnalyzing(false);
    }
  }

  const extractInsights = async (allContent: string[], finalAnalysis: string) => {
    setProgress(prev => [...prev, "Final analysis complete, extracting key insights and probability estimates..."]);
    
    const insightsResponse = await supabase.functions.invoke('extract-research-insights', {
      body: {
        webContent: allContent.join('\n\n'),
        analysis: finalAnalysis,
        marketId: marketId,
        marketQuestion: description
      }
    })

    if (insightsResponse.error) {
      console.error("Error from extract-research-insights:", insightsResponse.error)
      throw insightsResponse.error
    }

    console.log("Received response from extract-research-insights")

    let accumulatedJson = ''
    
    const processInsightsStream = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const textDecoder = new TextDecoder()
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log("Insights stream complete")
          
          // When stream is complete, try to clean and parse the JSON
          try {
            // Clean any markdown code block syntax from the JSON string
            let cleanJson = accumulatedJson;
            if (cleanJson.startsWith('```json')) {
              cleanJson = cleanJson.replace(/^```json\n/, '').replace(/```$/, '');
            } else if (cleanJson.startsWith('```')) {
              cleanJson = cleanJson.replace(/^```\n/, '').replace(/```$/, '');
            }
            
            console.log("Attempting to parse cleaned JSON:", cleanJson.substring(0, 100) + "...");
            
            const finalData = JSON.parse(cleanJson);
            setStreamingState({
              rawText: cleanJson,
              parsedData: {
                probability: finalData.probability || "Unknown",
                areasForResearch: Array.isArray(finalData.areasForResearch) ? finalData.areasForResearch : []
              }
            });
            
            // Add a summary of extracted insights to progress
            setProgress(prev => [...prev, `Extracted probability: ${finalData.probability || "Unknown"}`]);
            if (Array.isArray(finalData.areasForResearch) && finalData.areasForResearch.length > 0) {
              setProgress(prev => [
                ...prev, 
                `Identified ${finalData.areasForResearch.length} areas needing further research`
              ]);
            }
          } catch (e) {
            console.error('Final JSON parsing error:', e);
            
            // Additional fallback: Try to extract JSON with regex
            try {
              const jsonMatch = accumulatedJson.match(/\{[\s\S]*?\}/);
              if (jsonMatch && jsonMatch[0]) {
                const extractedJson = jsonMatch[0];
                console.log("Attempting regex extraction:", extractedJson.substring(0, 100) + "...");
                
                const fallbackData = JSON.parse(extractedJson);
                setStreamingState({
                  rawText: extractedJson,
                  parsedData: {
                    probability: fallbackData.probability || "Unknown",
                    areasForResearch: Array.isArray(fallbackData.areasForResearch) ? fallbackData.areasForResearch : []
                  }
                });
                
                setProgress(prev => [...prev, `Extracted probability using fallback: ${fallbackData.probability || "Unknown"}`]);
              } else {
                throw new Error("Could not extract valid JSON with regex");
              }
            } catch (regexError) {
              console.error("Regex extraction failed:", regexError);
              // Last resort: If we couldn't parse the JSON, set a default state
              setStreamingState({
                rawText: accumulatedJson,
                parsedData: {
                  probability: "Unknown (parsing error)",
                  areasForResearch: ["Could not parse research areas due to format error."]
                }
              });
            }
          }
          
          break;
        }
        
        const chunk = textDecoder.decode(value)
        console.log("Received insights chunk of size:", chunk.length)
        
        buffer += chunk
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (jsonStr === '[DONE]') continue
            
            try {
              const { content } = cleanStreamContent(jsonStr)
              
              if (content) {
                console.log("Received insights content chunk:", content.substring(0, 50) + "...")
                accumulatedJson += content
                
                // Try parsing on each chunk, but don't throw errors during streaming
                try {
                  // Strip markdown code block syntax if present
                  let tempJson = accumulatedJson;
                  if (tempJson.startsWith('```json')) {
                    tempJson = tempJson.replace(/^```json\n/, '');
                  } else if (tempJson.startsWith('```')) {
                    tempJson = tempJson.replace(/^```\n/, '');
                  }
                  // Remove trailing backticks if present
                  if (tempJson.endsWith('```')) {
                    tempJson = tempJson.replace(/```$/, '');
                  }
                  
                  const parsedJson = JSON.parse(tempJson);
                  
                  if (parsedJson.probability && Array.isArray(parsedJson.areasForResearch)) {
                    setStreamingState({
                      rawText: tempJson,
                      parsedData: parsedJson
                    });
                  }
                } catch (e) {
                  // Silently continue accumulating if not valid JSON yet
                  console.debug('JSON not complete yet, continuing to accumulate');
                }
              }
            } catch (e) {
              console.debug('Chunk parse error (expected during streaming):', e)
            }
          }
        }
      }
    }

    const insightsReader = new Response(insightsResponse.data.body).body?.getReader()
    
    if (!insightsReader) {
      throw new Error('Failed to get reader from insights response')
    }
    
    await processInsightsStream(insightsReader)
  }

  const handleWebScrape = async (queries: string[], iteration: number, previousContent: string[] = []) => {
    try {
      setProgress(prev => [...prev, `Starting iteration ${iteration} of ${maxIterations}...`])
      setCurrentIteration(iteration)
      setExpandedIterations(prev => [...prev, `iteration-${iteration}`])
      
      console.log(`Calling web-scrape function with queries for iteration ${iteration}:`, queries)
      console.log(`Market ID for web-scrape: ${marketId}`)
      console.log(`Market description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`)
      
      // Set the current queries for display
      setCurrentQueries(queries);
      setCurrentQueryIndex(-1);
      
      // Ensure queries don't exceed reasonable length - shorter queries are processed faster
      const shortenedQueries = queries.map(query => {
        // Remove any accidental market ID and limit query length
        const cleanedQuery = query.replace(new RegExp(` ${marketId}$`), '');
        if (cleanedQuery.length > 200) {
          return cleanedQuery.substring(0, 200);
        }
        return cleanedQuery;
      });
      
      const response = await supabase.functions.invoke('web-scrape', {
        body: JSON.stringify({ 
          queries: shortenedQueries,
          marketId: marketId,
          marketDescription: description
        })
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
                  
                  // Extract and update current query index
                  const queryMatch = parsed.message.match(/processing query (\d+)\/\d+: (.*)/i);
                  if (queryMatch && queryMatch[1] && queryMatch[2]) {
                    const queryIndex = parseInt(queryMatch[1], 10) - 1;
                    setCurrentQueryIndex(queryIndex);
                    
                    // Display clean query without market ID
                    const cleanQueryText = queryMatch[2].replace(new RegExp(` ${marketId}$`), '');
                    setProgress(prev => [...prev, `Iteration ${iteration}: Searching "${cleanQueryText}"`]);
                  } else {
                    // Fallback for other messages
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

  const handleResearch = async () => {
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
      setProgress(prev => [...prev, "Generating initial search queries..."])

      try {
        console.log("Calling generate-queries with:", { 
          description, 
          marketId,
          descriptionLength: description ? description.length : 0 
        });
        
        const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
          body: JSON.stringify({ 
            query: description,
            marketId: marketId,
            marketDescription: description,
            question: description,
            iteration: 1 // Explicitly mark this as iteration 1
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

        // Filter out any queries that might have accidental market ID appended
        const cleanQueries = queriesData.queries.map(q => q.replace(new RegExp(` ${marketId}$`), ''));
        
        console.log("Generated clean queries:", cleanQueries)
        setProgress(prev => [...prev, `Generated ${cleanQueries.length} search queries`])
        
        // Set current queries immediately for display
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
        
        // Set fallback queries for display
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

  const canSave = !isLoading && !isAnalyzing && results.length > 0 && analysis && streamingState.parsedData

  useEffect(() => {
    const shouldAutoSave = !isLoading && 
                          !isAnalyzing && 
                          results.length > 0 && 
                          analysis && 
                          streamingState.parsedData &&
                          !error;

    if (shouldAutoSave) {
      saveResearch();
    }
  }, [isLoading, isAnalyzing, results.length, analysis, streamingState.parsedData, error]);

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
                currentQueryIndex === index ? 'bg-primary/10 text-primary' : 'bg-muted/30'
              }`}
            >
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-muted text-xs">
                {index + 1}
              </span>
              <span className="flex-1">{query}</span>
              {currentQueryIndex === index && (
                <span className="animate-pulse text-xs text-primary">Processing...</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="flex flex-col shadow-sm relative overflow-hidden dark:bg-blue-950/10">
      <div className="p-4 border-b flex justify-between items-center">
        <ResearchHeader 
          isLoading={isLoading} 
          isAnalyzing={isAnalyzing}
          onResearch={handleResearch} 
        />
        
        <div className="flex items-center space-x-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2 text-sm">Search Iterations</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Control how many iterations of research to perform
                  </p>
                  <div className="flex items-center justify-between">
                    <Slider
                      value={[maxIterations]}
                      min={1}
                      max={5}
                      step={1}
                      onValueChange={(val) => setMaxIterations(val[0])}
                      className="w-[60%]"
                      disabled={isLoading || isAnalyzing}
                    />
                    <span className="bg-muted text-foreground px-2 py-1 rounded-md text-xs">
                      {maxIterations} iterations
                    </span>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          {savedResearch && savedResearch.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  History <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[240px]">
                <DropdownMenuLabel>Saved Research</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedResearch.map((research) => (
                  <DropdownMenuItem 
                    key={research.id}
                    onClick={() => loadSavedResearch(research)}
                  >
                    <div>
                      <div className="font-medium">
                        {format(new Date(research.created_at), 'PPP p')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {research.sources.length} sources • {research.areas_for_research.length} insights
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm">
          {error}
        </div>  
      )}
      
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col border-r">
          <div className="p-4 border-b">
            <ProgressDisplay 
              progress={progress} 
            />
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            {renderQueryDisplay()}
            
            {iterations.length > 0 ? (
              <Accordion
                type="multiple"
                value={expandedIterations}
                className="space-y-4"
              >
                {iterations.map((iteration) => (
                  <AccordionItem 
                    key={`iteration-${iteration.iteration}`} 
                    value={`iteration-${iteration.iteration}`}
                    className="border rounded-md overflow-hidden"
                  >
                    <AccordionTrigger className="px-4 py-2 hover:no-underline">
                      <span className="flex items-center text-sm font-medium">
                        <Badge variant="outline" className="mr-2">
                          Iteration {iteration.iteration}
                        </Badge>
                        <span>
                          {iteration.queries.length} queries • {iteration.results.length} results
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pt-0">
                      <div className="text-sm space-y-2">
                        <div className="border-t px-4 py-3 bg-muted/30">
                          <h4 className="font-medium text-xs mb-2">Search Queries:</h4>
                          <div className="space-y-1">
                            {iteration.queries.map((query, index) => (
                              <div key={index} className="flex text-xs">
                                <span className="w-5 flex-shrink-0">{index + 1}.</span>
                                <span>{query}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="border-t px-4 py-3">
                          <h4 className="font-medium text-xs mb-2">Sources ({iteration.results.length}):</h4>
                          <div className="space-y-1 text-xs">
                            {iteration.results.map((result, index) => (
                              <div key={index} className="flex gap-1 items-center">
                                <span className="w-5 flex-shrink-0">{index + 1}.</span>
                                <a 
                                  href={result.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                                >
                                  {result.title || result.url}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="border-t px-4 py-3">
                          <h4 className="font-medium text-xs mb-2">Analysis:</h4>
                          <ScrollArea className="h-[300px] rounded-md border p-3">
                            <AnalysisDisplay content={iteration.analysis || "Analyzing content..."} />
                          </ScrollArea>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              results.length > 0 && (
                <SitePreviewList results={results} />
              )
            )}
          </div>
        </div>
        
        <div className="flex flex-col">
          <div className="flex-1 overflow-auto">
            {analysis ? (
              <div className="p-4">
                <h3 className="font-medium text-lg mb-3">Analysis</h3>
                <ScrollArea className="h-[calc(100vh-320px)] rounded-md border p-4">
                  <AnalysisDisplay content={analysis} />
                </ScrollArea>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8 text-center">
                <div className="max-w-md">
                  <h3 className="text-lg font-medium mb-2">
                    {isLoading ? "Researching..." : "Start Research"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {isLoading 
                      ? "Searching the web for information..."
                      : "Click Research to analyze this market with AI-powered web research."
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {streamingState.parsedData && (
            <div className="border-t p-4">
              <InsightsDisplay streamingState={streamingState} />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
