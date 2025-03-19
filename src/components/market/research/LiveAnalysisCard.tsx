
import { useState, useRef, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AnalysisDisplay } from "./AnalysisDisplay"
import { Badge } from "@/components/ui/badge"
import { Zap, Loader2, StopCircle, AlertCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface LiveAnalysisCardProps {
  description: string;
  maxHeight?: string;
}

export function LiveAnalysisCard({ description, maxHeight = "500px" }: LiveAnalysisCardProps) {
  const [content, setContent] = useState<string>("")
  const [focusText, setFocusText] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [streamingAnalysis, setStreamingAnalysis] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleStartStreaming = async () => {
    if (!content.trim()) {
      toast({
        title: "Content Required",
        description: "Please enter content to analyze.",
        variant: "destructive"
      })
      return
    }

    if (isStreaming) {
      return
    }

    setError(null)
    setStreamingAnalysis("")
    setIsStreaming(true)

    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          content: content,
          query: description,
          focusText: focusText.trim() || undefined
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`Failed to connect to streaming analysis: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("Response body reader is null")
      }

      let buffer = ""

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              setIsStreaming(false)
              break
            }

            const chunk = new TextDecoder().decode(value)
            buffer += chunk

            const messages = buffer.split("\n\n")
            for (let i = 0; i < messages.length - 1; i++) {
              const message = messages[i].replace(/^data: /, "")
              
              if (!message.trim()) continue

              try {
                const data = JSON.parse(message)

                if (data.error) {
                  setError(data.error)
                  toast({
                    title: "Streaming Error",
                    description: data.error,
                    variant: "destructive"
                  })
                  continue
                }

                if (data.done) {
                  setIsStreaming(false)
                  continue
                }

                if (data.chunk) {
                  setStreamingAnalysis(prev => prev + data.chunk)
                }
              } catch (e) {
                console.error("Error parsing SSE message:", e, message)
              }
            }

            buffer = messages[messages.length - 1]
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error("Stream processing error:", error)
            setError(`Stream processing error: ${error.message}`)
          }
          setIsStreaming(false)
        }
      }

      processStream()

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Stream fetch error:", error)
        setError(`Stream connection error: ${error.message}`)
        toast({
          title: "Connection Error",
          description: error.message,
          variant: "destructive"
        })
      }
      setIsStreaming(false)
    }
  }

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
  }

  return (
    <Card className="p-4 space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Live Analysis</h2>
          {isStreaming && 
            <Badge variant="outline" className="bg-green-500/10 text-green-500 animate-pulse">
              Streaming
            </Badge>
          }
        </div>
        
        <div className="flex items-center gap-2">
          {!isStreaming ? (
            <Button 
              onClick={handleStartStreaming} 
              className="flex items-center gap-2"
              disabled={!content.trim()}
            >
              <Zap className="h-4 w-4" />
              Start Live Analysis
            </Button>
          ) : (
            <Button 
              onClick={handleStopStreaming}
              variant="destructive"
              size="sm"
              className="flex items-center gap-2"
            >
              <StopCircle className="h-4 w-4" />
              Stop
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="focusText">Focus Area (Optional)</Label>
          <Input
            id="focusText"
            placeholder="Add a specific focus area for the analysis..."
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            disabled={isStreaming}
            className="w-full"
          />
        </div>

        <div>
          <Label htmlFor="contentToAnalyze">Content to Analyze</Label>
          <Textarea
            id="contentToAnalyze"
            placeholder="Paste content to analyze here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isStreaming}
            className="w-full min-h-[150px]"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-3 rounded">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {(streamingAnalysis || isStreaming) && (
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium">Analysis</h3>
            {isStreaming && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-green-500" />
                <span className="text-sm text-muted-foreground">Processing in real-time...</span>
              </div>
            )}
          </div>
          
          <AnalysisDisplay 
            content={streamingAnalysis} 
            isStreaming={isStreaming} 
            maxHeight={maxHeight}
          />
        </div>
      )}
    </Card>
  )
}
