import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Search } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"

interface WebResearchCardProps {
  description: string
}

interface ResearchResult {
  url: string
  content: string
  title?: string
}

export function WebResearchCard({ description }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [results, setResults] = useState<ResearchResult[]>([])
  const [analysis, setAnalysis] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const handleResearch = async () => {
    setIsLoading(true)
    setProgress([])
    setResults([])
    setAnalysis('')
    setError(null)

    try {
      // First, generate queries
      const { data: queriesData, error: queriesError } = await supabase.functions.invoke('generate-queries', {
        body: { query: description }
      })

      if (queriesError) {
        throw new Error(`Error generating queries: ${queriesError.message}`)
      }

      if (!queriesData.queries || !Array.isArray(queriesData.queries)) {
        throw new Error('Invalid queries response')
      }

      // Then, perform web scraping with the generated queries
      const response = await supabase.functions.invoke('web-research', {
        body: { queries: queriesData.queries }
      })

      if (response.error) throw response.error

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
                    if (parsed.type === 'results') {
                      setResults(prev => [...prev, ...parsed.data])
                    } else if (parsed.message) {
                      setProgress(prev => [...prev, parsed.message])
                    } else if (parsed.choices?.[0]?.delta?.content) {
                      // Handle streaming analysis from Gemini Flash
                      setAnalysis(prev => prev + parsed.choices[0].delta.content)
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
    } catch (error) {
      console.error('Error in web research:', error)
      setError('Error occurred during research')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Web Research</h3>
        <Button 
          onClick={handleResearch} 
          disabled={isLoading}
          variant="outline"
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Researching...
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
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {analysis}
          </div>
        </ScrollArea>
      )}

      {results.length > 0 && (
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
    </Card>
  )
}