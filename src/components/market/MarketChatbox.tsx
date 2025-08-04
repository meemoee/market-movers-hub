import { MessageCircle, Send, Settings } from 'lucide-react'
import { useState, useRef, useEffect, useMemo, memo } from 'react'
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

interface StreamingMessage {
  content: string
  reasoning: string
}

const MarketChatbox = memo(function MarketChatbox({ marketId, marketQuestion }: MarketChatboxProps) {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [hasStreamingStarted, setHasStreamingStarted] = useState(false)
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
    
    // Reset streaming state
    setStreamingContent('')
    setStreamingReasoning('')
    setHasStreamingStarted(false)
    
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

      // Use EventSource for proper SSE streaming instead of fetch
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token

      if (!authToken) {
        throw new Error("No authentication token available")
      }

      // Create the SSE URL with auth params
      const sseUrl = new URL("https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/market-chat")
      sseUrl.searchParams.append('message', userMessage)
      sseUrl.searchParams.append('chatHistory', messages.map(m => `${m.type}: ${m.content}`).join('\n'))
      sseUrl.searchParams.append('userId', user?.id || '')
      sseUrl.searchParams.append('marketId', marketId)
      sseUrl.searchParams.append('marketQuestion', marketQuestion)
      sseUrl.searchParams.append('selectedModel', selectedModel)

      console.log('Creating EventSource for real streaming...')
      
      const eventSource = new EventSource(sseUrl.toString(), {
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc"
        }
      } as any)

      let accumulatedContent = ''
      let accumulatedReasoning = ''

      eventSource.onmessage = (event) => {
        const timestamp = Date.now()
        console.log(`[${timestamp}] EventSource message received:`, event.data.substring(0, 100))
        
        if (event.data === '[DONE]') {
          console.log('Stream complete via EventSource')
          eventSource.close()
          setMessages(prev => [...prev, { 
            type: 'assistant', 
            content: accumulatedContent,
            reasoning: accumulatedReasoning 
          }])
          setIsLoading(false)
          return
        }

        try {
          const parsed = JSON.parse(event.data)
          const content = parsed.choices?.[0]?.delta?.content
          const reasoning = parsed.choices?.[0]?.delta?.reasoning
          
          if (content) {
            accumulatedContent += content
            console.log(`[${timestamp}] INSTANT content display:`, content)
            setStreamingContent(accumulatedContent)
            if (!hasStreamingStarted) {
              setHasStreamingStarted(true)
            }
          }
          
          if (reasoning) {
            accumulatedReasoning += reasoning
            console.log(`[${timestamp}] INSTANT reasoning display:`, reasoning)
            setStreamingReasoning(accumulatedReasoning)
            if (!hasStreamingStarted) {
              setHasStreamingStarted(true)
            }
          }
        } catch (e) {
          console.error('Error parsing EventSource data:', e, event.data)
        }
      }

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error)
        eventSource.close()
        throw new Error('EventSource connection failed')
      }

      // Clean up EventSource on abort
      abortControllerRef.current?.signal.addEventListener('abort', () => {
        eventSource.close()
      })

      console.log('=== MarketChatbox: Chat message completed successfully ===')

    } catch (error) {
      console.error('=== MarketChatbox: Error in chat ===', error)
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }])
    } finally {
      console.log('Cleaning up: setting loading to false and clearing streaming content')
      setTimeout(() => {
        setIsLoading(false)
        setStreamingContent('')
        setStreamingReasoning('')
        setHasStreamingStarted(false)
      }, 200)
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
        <ChatMessages 
          messages={messages}
          streamingContent={streamingContent}
          streamingReasoning={streamingReasoning}
          hasStreamingStarted={hasStreamingStarted}
          isLoading={isLoading}
        />
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
})

// Memoized chat messages component for optimized re-renders
const ChatMessages = memo(function ChatMessages({ 
  messages, 
  streamingContent,
  streamingReasoning,
  hasStreamingStarted,
  isLoading
}: {
  messages: Message[]
  streamingContent: string
  streamingReasoning: string
  hasStreamingStarted: boolean
  isLoading: boolean
}) {
  
  return (
    <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
      {messages.map((message, index) => (
        <MessageBubble key={index} message={message} />
      ))}
      
      {/* Only show streaming bubbles when content has started arriving */}
      {hasStreamingStarted && (
        <div className="space-y-2">
          {streamingReasoning && (
            <div className="bg-yellow-100/50 border-l-4 border-yellow-400 p-3 rounded-lg">
              <p className="text-xs font-medium text-yellow-800 mb-1">REASONING:</p>
              <div className="text-xs text-yellow-700 whitespace-pre-wrap font-mono">
                {streamingReasoning}
              </div>
            </div>
          )}
          {streamingContent && (
            <div className="bg-muted/50 p-3 rounded-lg">
              <div className="text-sm whitespace-pre-wrap font-mono">
                {streamingContent}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Only show thinking when loading but no streaming has started */}
      {isLoading && !hasStreamingStarted && (
        <div className="bg-muted/50 p-3 rounded-lg">
          <p className="text-sm text-muted-foreground">Thinking...</p>
        </div>
      )}
    </div>
  )
})

// Memoized message bubble for individual messages
const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  return (
    <div className="space-y-2">
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
  )
})

export { MarketChatbox }