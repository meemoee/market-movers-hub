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
}

export function WebResearchCard({ description }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [results, setResults] = useState<ResearchResult[]>([])

  const handleResearch = async () => {
    setIsLoading(true)
    setProgress([])
    setResults([])

    try {
      const response = await supabase.functions.invoke<any>('web-research', {
        body: { query: description }
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
                      setResults(parsed.data)
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
    } catch (error) {
      console.error('Error in web research:', error)
      setProgress(prev => [...prev, 'Error occurred during research'])
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

      {progress.length > 0 && (
        <ScrollArea className="h-[200px] rounded-md border p-4">
          {progress.map((message, index) => (
            <div key={index} className="text-sm text-muted-foreground">
              {message}
            </div>
          ))}
        </ScrollArea>
      )}

      {results.length > 0 && (
        <ScrollArea className="h-[300px] rounded-md border p-4">
          {results.map((result, index) => (
            <div key={index} className="mb-4 last:mb-0">
              <a 
                href={result.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-500 hover:underline"
              >
                {result.url}
              </a>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.content.slice(0, 200)}...
              </p>
            </div>
          ))}
        </ScrollArea>
      )}
    </Card>
  )
}