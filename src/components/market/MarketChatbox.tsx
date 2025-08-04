import { MessageCircle, Send, Settings } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Card } from "@/components/ui/card"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface MarketChatboxProps {
  marketId: string
  marketQuestion: string
}

interface Message {
  type: 'user' | 'assistant'
  content?: string
  reasoning?: string
}

interface OpenRouterModel {
  id: string
  name: string
  description?: string
}

export function MarketChatbox({ marketId, marketQuestion }: MarketChatboxProps) {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [selectedModel, setSelectedModel] = useState('perplexity/sonar')
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingContentRef = useRef<HTMLDivElement>(null)
  const { user } = useCurrentUser()

  // DOM-based streaming content update
  const updateStreamingContent = useCallback((content: string, isComplete: boolean = false) => {
    if (streamingContentRef.current) {
      if (isComplete) {
        // Final update: clear DOM content and let React take over
        streamingContentRef.current.innerHTML = ''
        setStreamingContent(content)
        setIsStreaming(false)
      } else {
        // Live update: directly manipulate DOM for immediate display
        const cursor = '<span class="inline-block w-2 h-4 bg-primary ml-1 animate-pulse">|</span>'
        streamingContentRef.current.innerHTML = `<div class="text-sm whitespace-pre-wrap">${content}${cursor}</div>`
        setIsStreaming(true)
      }
    }
  }, [])

  // Fetch available models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true)
      try {
        const { data, error } = await supabase.functions.invoke('get-openrouter-models', {
          body: { userId: user?.id }
        })
        if (error) throw error
        
        console.log('Fetched models from API:', data.models?.length || 0)
        setAvailableModels(data.models || [])
      } catch (error) {
        console.error('Failed to fetch OpenRouter models:', error)
        // Set fallback models if API fails
        setAvailableModels([
          { id: 'perplexity/sonar', name: 'Perplexity Sonar', description: 'Fast and accurate' },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI fast model' },
          { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', description: 'Anthropic fast model' }
        ])
      } finally {
        setModelsLoading(false)
      }
    }

    fetchModels()
  }, [user?.id])

  const handleChatMessage = async (userMessage: string) => {
    console.log('=== MarketChatbox: Starting chat message ===')
    console.log('User message:', userMessage)
    console.log('Current messages count:', messages.length)
    console.log('Is loading:', isLoading)
    
    if (!userMessage.trim() || isLoading) return
    
    setHasStartedChat(true)
    setIsLoading(true)
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    
    try {
      if (abortControllerRef.current) {
        console.log('Aborting previous request')
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()

      console.log('Sending request to market-chat function with data:', {
        message: userMessage,
        chatHistoryLength: messages.length,
        userId: user?.id,
        marketId,
        marketQuestion
      })

      // Get auth token for direct fetch call
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token

      if (!authToken) {
        throw new Error("No authentication token available")
      }

      // Make direct fetch call to edge function with streaming
      const response = await fetch(
        "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/market-chat",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${authToken}`,
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: userMessage,
            chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n'),
            userId: user?.id,
            marketId,
            marketQuestion,
            selectedModel
          }),
          signal: abortControllerRef.current?.signal
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Edge function error: ${response.status} - ${errorText}`)
      }

      console.log('Got streaming response from market-chat')
      
      // Process the streaming response
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      const decoder = new TextDecoder()
      let accumulatedContent = ''
      let accumulatedReasoning = ''
      let lineBuffer = '' // Buffer for incomplete SSE lines
      let chunkCounter = 0
      let linesProcessed = 0
      let dataLinesProcessed = 0
      
      console.log('🔄 [STREAM-FRONTEND] Starting stream processing')
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            console.log(`🏁 [STREAM-FRONTEND] Stream complete. Final stats:`)
            console.log(`   - Chunks processed: ${chunkCounter}`)
            console.log(`   - Lines processed: ${linesProcessed}`)
            console.log(`   - Data lines processed: ${dataLinesProcessed}`)
            console.log(`   - Final content length: ${accumulatedContent.length}`)
            console.log(`   - Final reasoning length: ${accumulatedReasoning.length}`)
            console.log(`   - Remaining buffer: "${lineBuffer}"`)
            
            // Complete the streaming with final update
            updateStreamingContent(accumulatedContent, true)
            setMessages(prev => [...prev, { 
              type: 'assistant', 
              content: accumulatedContent,
              reasoning: accumulatedReasoning 
            }])
            break
          }
          
          chunkCounter++
          const rawChunk = decoder.decode(value, { stream: true })
          console.log(`📦 [STREAM-FRONTEND-${chunkCounter}] Received chunk:`)
          console.log(`   - Byte length: ${value.length}`)
          console.log(`   - Text length: ${rawChunk.length}`)
          console.log(`   - Current buffer length: ${lineBuffer.length}`)
          console.log(`   - Raw chunk preview: "${rawChunk.substring(0, 200)}${rawChunk.length > 200 ? '...' : ''}"`)
          
          // Concatenate with any buffered incomplete line from previous chunks
          const fullText = lineBuffer + rawChunk
          console.log(`🔗 [STREAM-FRONTEND-${chunkCounter}] After concatenation:`)
          console.log(`   - Full text length: ${fullText.length}`)
          console.log(`   - Full text preview: "${fullText.substring(0, 200)}${fullText.length > 200 ? '...' : ''}"`)
          
          // Split into lines
          const lines = fullText.split('\n')
          console.log(`📝 [STREAM-FRONTEND-${chunkCounter}] Split into ${lines.length} lines`)
          
          // Process all complete lines (all but the last, unless it ends with \n)
          const completeLines = fullText.endsWith('\n') ? lines : lines.slice(0, -1)
          lineBuffer = fullText.endsWith('\n') ? '' : lines[lines.length - 1]
          
          console.log(`✅ [STREAM-FRONTEND-${chunkCounter}] Processing ${completeLines.length} complete lines`)
          console.log(`💾 [STREAM-FRONTEND-${chunkCounter}] Buffering incomplete line: "${lineBuffer}"`)
          
          for (let i = 0; i < completeLines.length; i++) {
            const line = completeLines[i]
            linesProcessed++
            
            console.log(`📋 [STREAM-FRONTEND-${chunkCounter}] Line ${i + 1}/${completeLines.length}: "${line}"`)
            
            if (line.trim() && line.startsWith('data: ')) {
              dataLinesProcessed++
              const jsonStr = line.slice(6).trim()
              
              console.log(`🎯 [STREAM-FRONTEND-${chunkCounter}] Found data line #${dataLinesProcessed}:`)
              console.log(`   - JSON string: "${jsonStr}"`)
              
              if (jsonStr === '[DONE]') {
                console.log(`🏁 [STREAM-FRONTEND-${chunkCounter}] Found [DONE] marker`)
                continue
              }
              
              try {
                const parsed = JSON.parse(jsonStr)
                console.log(`🎨 [STREAM-FRONTEND-${chunkCounter}] Parsed JSON:`, parsed)
                
                const content = parsed.choices?.[0]?.delta?.content
                const reasoning = parsed.choices?.[0]?.delta?.reasoning
                
                console.log(`📊 [STREAM-FRONTEND-${chunkCounter}] Extracted data:`)
                console.log(`   - Content: "${content || 'none'}"`)
                console.log(`   - Reasoning: "${reasoning || 'none'}"`)
                
                if (content) {
                  accumulatedContent += content
                  console.log(`📝 [STREAM-FRONTEND-${chunkCounter}] Updated content total length: ${accumulatedContent.length}`)
                  
                  // DOM-based streaming update for immediate display
                  updateStreamingContent(accumulatedContent)
                  console.log(`🚀 [STREAM-FRONTEND-${chunkCounter}] DOM updated directly`)
                }
                
                if (reasoning) {
                  accumulatedReasoning += reasoning
                  console.log(`🤔 [STREAM-FRONTEND-${chunkCounter}] Updated reasoning total length: ${accumulatedReasoning.length}`)
                  
                  flushSync(() => {
                    setStreamingReasoning(accumulatedReasoning)
                  })
                }
              } catch (e) {
                console.error(`❌ [STREAM-FRONTEND-${chunkCounter}] Error parsing SSE data:`, e)
                console.error(`   - Failed JSON string: "${jsonStr}"`)
                console.error(`   - Error details:`, e)
              }
            } else if (line.trim()) {
              console.log(`⚠️ [STREAM-FRONTEND-${chunkCounter}] Non-data line: "${line}"`)
            }
          }
          
          console.log(`📈 [STREAM-FRONTEND-${chunkCounter}] Chunk summary:`)
          console.log(`   - Lines processed in this chunk: ${completeLines.length}`)
          console.log(`   - Data lines found: ${completeLines.filter(l => l.startsWith('data: ')).length}`)
          console.log(`   - Current content length: ${accumulatedContent.length}`)
          console.log(`   - Current reasoning length: ${accumulatedReasoning.length}`)
          console.log(`   - Buffer status: "${lineBuffer}"`)
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          throw error
        }
      }

      console.log('=== MarketChatbox: Chat message completed successfully ===')

    } catch (error) {
      console.error('=== MarketChatbox: Error in chat ===', error)
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }])
    } finally {
      console.log('Cleaning up: setting loading to false and clearing streaming content')
      setIsLoading(false)
      setStreamingContent('')
      setStreamingReasoning('')
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }

  return (
    <Card className="p-6 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Market Chat</h3>
      </div>
      
      {!hasStartedChat ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            Ask questions about this market or get AI insights on factors that might influence the outcome.
          </p>
          <p className="text-sm text-muted-foreground">
            Market: {marketQuestion}
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
              {message.reasoning && (
                <div className="bg-yellow-100/50 border-l-4 border-yellow-400 p-3 rounded-lg">
                  <p className="text-xs font-medium text-yellow-800 mb-1">REASONING:</p>
                  <ReactMarkdown className="text-xs prose prose-sm max-w-none text-yellow-700">
                    {message.reasoning}
                  </ReactMarkdown>
                </div>
              )}
              <div className="bg-muted/50 p-3 rounded-lg">
                {message.type === 'user' ? (
                  <p className="text-sm font-medium">{message.content}</p>
                ) : (
                  <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                    {message.content || ''}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          {(streamingReasoning || streamingContent) && (
            <div className="space-y-2">
              {streamingReasoning && (
                <div className="bg-yellow-100/50 border-l-4 border-yellow-400 p-3 rounded-lg">
                  <p className="text-xs font-medium text-yellow-800 mb-1">REASONING:</p>
                  <ReactMarkdown className="text-xs prose prose-sm max-w-none text-yellow-700">
                    {streamingReasoning}
                  </ReactMarkdown>
                </div>
              )}
              {(streamingContent || isStreaming) && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  {/* DOM-based streaming content or React-based final content */}
                  {isStreaming ? (
                    <div ref={streamingContentRef} className="min-h-[1rem]" />
                  ) : (
                    <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                      {streamingContent}
                    </ReactMarkdown>
                  )}
                </div>
              )}
            </div>
          )}
          {isLoading && !streamingContent && !streamingReasoning && (
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">Thinking...</p>
            </div>
          )}
        </div>
      )}

      {/* Model Selection */}
      <div className="mb-4 flex items-center gap-2">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Model:</span>
        <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading || isLoading}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder={modelsLoading ? "Loading..." : "Select model"} />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id} className="text-xs">
                <div>
                  <div className="font-medium">{model.name}</div>
                  {model.description && (
                    <div className="text-muted-foreground text-xs">{model.description}</div>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleChatMessage(chatMessage)
            }
          }}
          placeholder="Ask about this market..."
          className="flex-grow p-2 bg-background border border-border rounded-lg text-sm"
        />
        <button 
          className="p-2 hover:bg-accent rounded-lg transition-colors text-primary"
          onClick={() => handleChatMessage(chatMessage)}
          disabled={isLoading}
        >
          <Send size={16} />
        </button>
      </div>
    </Card>
  )
}