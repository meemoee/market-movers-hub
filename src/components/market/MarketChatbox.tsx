import { MessageCircle, Send, Settings } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
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
  const abortControllerRef = useRef<AbortController | null>(null)
  const { user } = useCurrentUser()

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
      
      try {
        let chunkCount = 0
        let totalBytesReceived = 0
        
        while (true) {
          console.log(`[CHUNK-${chunkCount}] Starting read...`)
          const startTime = performance.now()
          const { done, value } = await reader.read()
          const readTime = performance.now() - startTime
          
          console.log(`[CHUNK-${chunkCount}] Read completed in ${readTime.toFixed(2)}ms:`, { 
            done, 
            chunkSize: value?.length,
            totalBytesReceived: totalBytesReceived + (value?.length || 0)
          })
          
          if (done) {
            console.log(`[STREAM-COMPLETE] Total chunks processed: ${chunkCount}, Total bytes: ${totalBytesReceived}`)
            console.log(`[STREAM-COMPLETE] Final accumulated content length: ${accumulatedContent.length}`)
            console.log(`[STREAM-COMPLETE] Final accumulated reasoning length: ${accumulatedReasoning.length}`)
            setMessages(prev => [...prev, { 
              type: 'assistant', 
              content: accumulatedContent,
              reasoning: accumulatedReasoning 
            }])
            break
          }
          
          totalBytesReceived += value?.length || 0
          const decodeStartTime = performance.now()
          const chunk = decoder.decode(value, { stream: true })
          const decodeTime = performance.now() - decodeStartTime
          
          console.log(`[CHUNK-${chunkCount}] Decoded in ${decodeTime.toFixed(2)}ms:`, {
            rawChunk: chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''),
            chunkLength: chunk.length,
            hasNewlines: chunk.includes('\n'),
            lineCount: chunk.split('\n').length
          })
          
          const lines = chunk.split('\n')
          console.log(`[CHUNK-${chunkCount}] Processing ${lines.length} lines`)
          
          let lineIndex = 0
          for (const line of lines) {
            console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Processing line:`, {
              line: line.substring(0, 150) + (line.length > 150 ? '...' : ''),
              lineLength: line.length,
              trimmedLength: line.trim().length,
              startsWithData: line.startsWith('data: ')
            })
            
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim()
              console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Found data line, JSON:`, {
                jsonStr: jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : ''),
                jsonLength: jsonStr.length,
                isDone: jsonStr === '[DONE]'
              })
              
              if (jsonStr === '[DONE]') {
                console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Found DONE signal`)
                lineIndex++
                continue
              }
              
              try {
                const parseStartTime = performance.now()
                const parsed = JSON.parse(jsonStr)
                const parseTime = performance.now() - parseStartTime
                
                console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Parsed JSON in ${parseTime.toFixed(2)}ms:`, {
                  hasChoices: !!parsed.choices,
                  choicesLength: parsed.choices?.length || 0,
                  hasDelta: !!parsed.choices?.[0]?.delta
                })
                
                const content = parsed.choices?.[0]?.delta?.content
                const reasoning = parsed.choices?.[0]?.delta?.reasoning
                
                console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Extracted data:`, {
                  hasContent: !!content,
                  contentLength: content?.length || 0,
                  contentPreview: content ? content.substring(0, 50) + (content.length > 50 ? '...' : '') : null,
                  hasReasoning: !!reasoning,
                  reasoningLength: reasoning?.length || 0,
                  reasoningPreview: reasoning ? reasoning.substring(0, 50) + (reasoning.length > 50 ? '...' : '') : null
                })
                
                if (content) {
                  const previousContentLength = accumulatedContent.length
                  accumulatedContent += content
                  console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Content accumulated:`, {
                    previousLength: previousContentLength,
                    addedLength: content.length,
                    newTotalLength: accumulatedContent.length,
                    contentAdded: content
                  })
                  
                  const setStreamStartTime = performance.now()
                  setStreamingContent(accumulatedContent)
                  const setStreamTime = performance.now() - setStreamStartTime
                  console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] setStreamingContent called in ${setStreamTime.toFixed(2)}ms`)
                }
                
                if (reasoning) {
                  const previousReasoningLength = accumulatedReasoning.length
                  accumulatedReasoning += reasoning
                  console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Reasoning accumulated:`, {
                    previousLength: previousReasoningLength,
                    addedLength: reasoning.length,
                    newTotalLength: accumulatedReasoning.length,
                    reasoningAdded: reasoning
                  })
                  
                  const setReasoningStartTime = performance.now()
                  setStreamingReasoning(accumulatedReasoning)
                  const setReasoningTime = performance.now() - setReasoningStartTime
                  console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] setStreamingReasoning called in ${setReasoningTime.toFixed(2)}ms`)
                }
                
                if (content || reasoning) {
                  console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Yielding control for React re-render...`)
                  const yieldStartTime = performance.now()
                  await new Promise(resolve => setTimeout(resolve, 0))
                  const yieldTime = performance.now() - yieldStartTime
                  console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Yield completed in ${yieldTime.toFixed(2)}ms`)
                }
              } catch (e) {
                console.error(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Error parsing SSE data:`, {
                  error: e,
                  line: line,
                  jsonStr: jsonStr
                })
              }
            } else {
              console.log(`[CHUNK-${chunkCount}][LINE-${lineIndex}] Skipping line:`, {
                isEmpty: !line.trim(),
                startsWithData: line.startsWith('data: '),
                linePreview: line.substring(0, 50)
              })
            }
            lineIndex++
          }
          
          console.log(`[CHUNK-${chunkCount}] Chunk processing complete. Current totals:`, {
            contentLength: accumulatedContent.length,
            reasoningLength: accumulatedReasoning.length,
            linesProcessed: lines.length
          })
          
          chunkCount++
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
              {streamingContent && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                    {streamingContent}
                  </ReactMarkdown>
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