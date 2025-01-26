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
  const [error, setError] = useState<string | null>(null)
  const [currentQueryIndex, setCurrentQueryIndex] = useState(0)
  const [totalQueries, setTotalQueries] = useState(0)

  const handleResearch = async () => {
    setIsLoading(true)
    setProgress([])
    setResults([])
    setError(null)
    setCurrentQueryIndex(0)
    setTotalQueries(0)

    try {
      // First, generate queries
      const queriesResponse = await supabase.functions.invoke('generate-queries', {
        body: { query: description }
      })

      if (queriesResponse.error) throw queriesResponse.error

      const { queries } = queriesResponse.data
      setTotalQueries(queries.length)
      setProgress(prev => [...prev, `Generated ${queries.length} research queries`])

      // Process each query sequentially
      for (let i = 0; i < queries.length; i++) {
        setCurrentQueryIndex(i + 1)
        const query = queries[i]
        
        const response = await supabase.functions.invoke<any>('process-query', {
          body: { query }
        })

        if (response.error) {
          console.error(`Error processing query ${i + 1}:`, response.error)
          continue
        }

        const stream = new Response(response.data.body).body
        if (!stream) continue

        const reader = stream.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
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
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e)
                }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (error: any) {
      console.error('Error in web research:', error)
      setError(error.message)
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
              {currentQueryIndex}/{totalQueries} Queries...
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
