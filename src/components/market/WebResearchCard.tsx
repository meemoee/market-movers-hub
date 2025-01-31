import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Search, Target, ArrowDown } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'

interface WebResearchCardProps {
  description: string
}

interface ResearchResult {
  url: string
  content: string
  title?: string
}

interface ExtractedInsights {
  probability: string
  areasForResearch: string[]
}

interface StreamingState {
  rawText: string
  parsedData: ExtractedInsights | null
}

export function WebResearchCard({ description }: WebResearchCardProps) {
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

  const getProbabilityColor = (probability: string) => {
    const numericProb = parseInt(probability.replace('%', ''))
    return numericProb >= 50 ? 'text-green-500' : 'text-red-500'
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
      // First, generate queries
      const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
        body: { query: description }
      })

      if (queriesError) {
        throw new Error(`Error generating queries: ${queriesError.message}`)
      }

      if (!queriesData?.queries || !Array.isArray(queriesData.queries)) {
        throw new Error('Invalid queries response')
      }

      // Then, perform web scraping with the generated queries
      const response = await supabase.functions.invoke('web-scrape', {
        body: { queries: queriesData.queries }
      })

      if (response.error) throw response.error

      const allContent: string[] = []

      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(response.data.body).body?.getReader()
          
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
                  
                  try {
                    const parsed = JSON.parse(jsonStr)
                    if (parsed.type === 'results' && Array.isArray(parsed.data)) {
                      setResults(prev => [...prev, ...parsed.data])
                      // Collect content for analysis
                      parsed.data.forEach((result: ResearchResult) => {
                        if (result?.content) {
                          allContent.push(result.content)
                        }
                      })
                    } else if (parsed.message) {
                      setProgress(prev => [...prev, parsed.message])
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
        throw new Error('No content collected from web scraping')
      }

      // After collecting all content, start the analysis
      setIsAnalyzing(true)
      const analysisResponse = await supabase.functions.invoke('analyze-web-content', {
        body: { 
          content: allContent.join('\n\n'),
          query: description
        }
      })

      if (analysisResponse.error) throw analysisResponse.error

      let accumulatedContent = ''
      
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
                    const parsed = JSON.parse(jsonStr)
                    const content = parsed.choices?.[0]?.delta?.content
                    if (content) {
                      accumulatedContent += content
                      setAnalysis(accumulatedContent)
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

      // Extract insights using streaming
      const insightsResponse = await supabase.functions.invoke('extract-research-insights', {
        body: {
          webContent: allContent.join('\n\n'),
          analysis: accumulatedContent
        }
      })

      if (insightsResponse.error) throw insightsResponse.error

      let accumulatedJson = ''
      
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
                    const parsed = JSON.parse(jsonStr)
                    const content = parsed.choices?.[0]?.delta?.content
                    
                    if (content) {
                      // Accumulate JSON text
                      accumulatedJson += content
                      
                      setStreamingState(prev => {
                        const newState = {
                          rawText: prev.rawText + content,
                          parsedData: prev.parsedData
                        }

                        // Try parsing accumulated JSON
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

    } catch (error) {
      console.error('Error in web research:', error)
      setError('Error occurred during research')
    } finally {
      setIsLoading(false)
      setIsAnalyzing(false)
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Web Research</h3>
        <Button 
          onClick={handleResearch} 
          disabled={isLoading || isAnalyzing}
          variant="outline"
          size="sm"
        >
          {isLoading || isAnalyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isAnalyzing ? 'Analyzing...' : 'Researching...'}
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Research
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/50 p-2 rounded">
          {error}
        </div>
      )}

      {progress.length > 0 && (
        <ScrollArea className="h-[100px] rounded-md border p-4">
          {progress.map((message, index) => (
            <div key={index} className="text-sm text-muted-foreground">
              {message}
            </div>
          ))}
        </ScrollArea>
      )}

      {analysis && (
        <ScrollArea className="h-[200px] rounded-md border p-4 bg-accent/5">
          <ReactMarkdown className="text-sm prose prose-invert prose-sm max-w-none">
            {analysis}
          </ReactMarkdown>
        </ScrollArea>
      )}

      {Array.isArray(results) && results.length > 0 && (
        <ScrollArea className="h-[400px] rounded-md border p-4">
          {results.map((result, index) => (
            <div key={index} className="mb-6 last:mb-0 p-3 bg-accent/5 rounded-lg">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  {result.title || new URL(result.url).hostname}
                </h4>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {result.content}
                </p>
                <a 
                  href={result.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline block"
                >
                  {result.url}
                </a>
              </div>
            </div>
          ))}
        </ScrollArea>
      )}

      {streamingState.rawText && !streamingState.parsedData && (
        <div className="space-y-4 rounded-md border p-4 bg-accent/5">
          <div className="text-sm text-muted-foreground animate-pulse">
            Analyzing insights...
          </div>
          <pre className="text-xs overflow-x-auto">
            {streamingState.rawText}
          </pre>
        </div>
      )}

      {streamingState.parsedData && (
        <div className="space-y-4 rounded-md border p-4 bg-accent/5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className={`text-sm font-medium ${getProbabilityColor(streamingState.parsedData.probability)}`}>
              Probability: {streamingState.parsedData.probability}
            </span>
          </div>
          {Array.isArray(streamingState.parsedData.areasForResearch) && streamingState.parsedData.areasForResearch.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Areas Needing Research:</div>
              <ul className="space-y-1">
                {streamingState.parsedData.areasForResearch.map((area, index) => (
                  <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                    <ArrowDown className="h-3 w-3" />
                    {area}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-center pt-2">
            <ArrowDown className="h-5 w-5 text-muted-foreground animate-bounce" />
          </div>
        </div>
      )}
    </Card>
  )
}