import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Search } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"

interface WebResearchCardProps {
  description: string
}

export function WebResearchCard({ description }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [sites, setSites] = useState<Array<{ url: string; content: string }>>([])
  const [totalSites, setTotalSites] = useState(0)

  const startResearch = async () => {
    setIsLoading(true)
    setProgress('')
    setSites([])
    setTotalSites(0)

    try {
      const { data: stream } = await supabase.functions.invoke("web-research", {
        body: { query: description }
      })

      if (!stream) {
        throw new Error('No stream returned')
      }

      const reader = stream.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              setProgress(data.message)
              setTotalSites(data.totalSites)
              if (data.sites) {
                setSites(data.sites)
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Research error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Web Research</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={startResearch}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing {totalSites} websites...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Research Web
            </>
          )}
        </Button>
      </div>

      {progress && (
        <p className="text-sm text-muted-foreground">{progress}</p>
      )}

      {sites.length > 0 && (
        <ScrollArea className="h-[200px] rounded-md border p-4">
          <div className="space-y-4">
            {sites.map((site, i) => (
              <div key={i} className="space-y-2">
                <a 
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer" 
                  className="text-sm font-medium text-blue-500 hover:underline"
                >
                  {site.url}
                </a>
                <p className="text-sm text-muted-foreground">
                  {site.content.slice(0, 200)}...
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </Card>
  )
}