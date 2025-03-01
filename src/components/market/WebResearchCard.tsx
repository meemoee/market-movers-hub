
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
import { supabase } from "@/integrations/supabase/client"
import { ResearchHeader } from "./research/ResearchHeader"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { InsightsDisplay } from "./research/InsightsDisplay"
import { ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useToast } from "@/components/ui/use-toast"
import { Json } from '@/integrations/supabase/types'

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
  } | null;
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
  const { toast } = useToast()

  // Query saved research with market_id filter
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
        areas_for_research: item.areas_for_research as string[]
      })) as SavedResearch[]
    }
  })

  const loadSavedResearch = (research: SavedResearch) => {
    setResults(research.sources)
    setAnalysis(research.analysis)
    
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

  // Helper function to check markdown formatting completeness
  const isCompleteMarkdown = (text: string): boolean => {
    const stack: string[] = [];
    let inCode = false;
    let inList = false;
    let currentNumber = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      const prevChar = text[i - 1];
      
      // Handle code blocks
      if (char === '`' && nextChar === '`' && text[i + 2] === '`') {
        inCode = !inCode;
        i += 2;
        continue;
      }
      
      if (inCode) continue;
      
      // Handle numbered lists
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
      
      // Handle bold
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
      
      // Handle single markers
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
        market_id: marketId
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

  const handleResearch = async () => {
    setIsLoading(true)
    setProgress([])
    setResults([])
    setError(null)
    setAnalysis('')
    setIsAnalyzing(false)
    setStreamingState({ rawText: '', parsedData: null })

    try {
      // Add initial progress message
      setProgress(prev => [...prev, "Starting web research..."])
      setProgress(prev => [...prev, "Generating search queries..."])

      // First, generate queries
      console.log("Calling generate-queries function with:", { query: description })
      const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
        body: { query: description }
      })

      if (queriesError) {
        console.error("Error from generate-queries:", queriesError)
        throw new Error(`Error generating queries: ${queriesError.message}`)
      }

      console.log("Received queries data:", queriesData)

      if (!queriesData?.queries || !Array.isArray(queriesData.queries)) {
        console.error("Invalid queries response:", queriesData)
        throw new Error('Invalid queries response')
      }

      // Log the generated queries
      console.log("Generated queries:", queriesData.queries)
      setProgress(prev => [...prev, `Generated ${queriesData.queries.length} search queries`])
      
      // Display the queries in the progress
      queriesData.queries.forEach((query: string, index: number) => {
        setProgress(prev => [...prev, `Query ${index + 1}: "${query}"`])
      })

      // Then, perform web scraping with the generated queries
      console.log("Calling web-scrape function with queries:", queriesData.queries)
      const response = await supabase.functions.invoke('web-scrape', {
        body: { queries: queriesData.queries }
      })

      if (response.error) {
        console.error("Error from web-scrape:", response.error)
        throw response.error
      }

      const allContent: string[] = []

      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(response.data.body).body?.getReader()
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                setProgress(prev => [...prev, "Search Completed"])
                controller.close()
                return
              }
              
              const chunk = textDecoder.decode(value)
              const lines = chunk.split('\n').filter(line => line.trim())
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  
                  try {
                    const parsed = JSON.parse(jsonStr)
                    if (parsed.type === 'results' && Array.isArray(parsed.data)) {
                      setResults(prev => [...prev, ...parsed.data])
                      parsed.data.forEach((result: ResearchResult) => {
                        if (result?.content) {
                          allContent.push(result.content)
                        }
                      })
                    } else if (parsed.message) {
                      const message = parsed.message.replace(
                        /processing query \d+\/\d+: (.*)/i, 
                        'Searching "$1"'
                      )
                      setProgress(prev => [...prev, message])
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e)
                  }
                }
              }
              
              push()
            })
          }
          
          push()
        }
      })

      const reader = stream.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      if (allContent.length === 0) {
        setProgress(prev => [...prev, "No results found. Try rephrasing your query."])
        setError('No content collected from web scraping. Try a more specific query or different keywords.')
        return // Exit early instead of throwing an error
      }

      // After collecting all content, start the analysis with improved streaming
      setIsAnalyzing(true)
      setProgress(prev => [...prev, "Starting content analysis..."])
      
      const analysisResponse = await supabase.functions.invoke('analyze-web-content', {
        body: { 
          content: allContent.join('\n\n'),
          query: description,
          question: description
        }
      })

      if (analysisResponse.error) throw analysisResponse.error

      let accumulatedContent = '';
      let incompleteMarkdown = '';
      
      const analysisStream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(analysisResponse.data.body).body?.getReader()
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                controller.close()
                return
              }
              
              const chunk = textDecoder.decode(value)
              const lines = chunk.split('\n').filter(line => line.trim())
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  if (jsonStr === '[DONE]') continue
                  
                  try {
                    const { content } = cleanStreamContent(jsonStr)
                    if (content) {
                      // Combine incomplete markdown with new content
                      let updatedContent = incompleteMarkdown + content
                      
                      // If we don't have complete markdown formatting
                      if (!isCompleteMarkdown(updatedContent)) {
                        incompleteMarkdown = updatedContent;
                        continue;
                      }
                      
                      // Reset incomplete markdown and update content
                      incompleteMarkdown = '';
                      accumulatedContent += updatedContent;
                      setAnalysis(accumulatedContent);
                    }
                  } catch (e) {
                    console.error('Error parsing analysis SSE data:', e)
                  }
                }
              }
              
              push()
            })
          }
          
          push()
        }
      })

      const analysisReader = analysisStream.getReader()
      while (true) {
        const { done } = await analysisReader.read()
        if (done) break
      }

      setProgress(prev => [...prev, "Analysis complete, extracting key insights..."])

      // Extract insights using streaming with the same markdown formatting
      const insightsResponse = await supabase.functions.invoke('extract-research-insights', {
        body: {
          webContent: allContent.join('\n\n'),
          analysis: accumulatedContent
        }
      })

      if (insightsResponse.error) throw insightsResponse.error

      let accumulatedJson = ''
      let incompleteInsightsMarkdown = ''
      
      const insightsStream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(insightsResponse.data.body).body?.getReader()
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                controller.close()
                return
              }
              
              const chunk = textDecoder.decode(value)
              const lines = chunk.split('\n').filter(line => line.trim())
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  if (jsonStr === '[DONE]') continue
                  
                  try {
                    const { content } = cleanStreamContent(jsonStr)
                    
                    if (content) {
                      // Handle markdown formatting for insights
                      let updatedContent = incompleteInsightsMarkdown + content
                      
                      if (!isCompleteMarkdown(updatedContent)) {
                        incompleteInsightsMarkdown = updatedContent
                        continue
                      }
                      
                      incompleteInsightsMarkdown = ''
                      accumulatedJson += updatedContent
                      
                      setStreamingState(prev => {
                        const newState = {
                          rawText: accumulatedJson,
                          parsedData: prev.parsedData
                        }

                        try {
                          const parsedJson = JSON.parse(accumulatedJson)
                          if (parsedJson.probability && Array.isArray(parsedJson.areasForResearch)) {
                            newState.parsedData = parsedJson
                          }
                        } catch {
                          // Continue accumulating if not valid JSON yet
                        }

                        return newState
                      })
                    }
                  } catch (e) {
                    console.debug('Chunk parse error (expected):', e)
                  }
                }
              }
              
              push()
            })
          }
          
          push()
        }
      })

      const insightsReader = insightsStream.getReader()
      while (true) {
        const { done } = await insightsReader.read()
        if (done) break
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
    // Auto-save when all content is ready
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

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <ResearchHeader 
          isLoading={isLoading}
          isAnalyzing={isAnalyzing}
          onResearch={handleResearch}
        />
        
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
                    {research.query}
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

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/50 p-2 rounded">
          {error}
        </div>
      )}

      <ProgressDisplay messages={progress} />
      
      <SitePreviewList results={results} />
      
      <AnalysisDisplay content={analysis} />
      
      <InsightsDisplay streamingState={streamingState} />
    </Card>
  )
}
