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

  // DOM-based streaming content update with browser repaint forcing
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
        
        // Force browser repaint using multiple techniques
        // 1. Force layout/reflow by accessing offsetHeight
        streamingContentRef.current.offsetHeight
        
        // 2. Trigger a CSS transform change to force repaint
        streamingContentRef.current.style.transform = 'translateZ(0)'
        
        // 3. Use requestAnimationFrame to ensure paint cycle
        requestAnimationFrame(() => {
          if (streamingContentRef.current) {
            // Reset transform after repaint
            streamingContentRef.current.style.transform = ''
          }
        })
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

  // Chat functionality using Web Worker
  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    
    setHasStartedChat(true)
    setIsLoading(true)
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    
    try {
      console.log('📤 [CHAT] Starting web worker for streaming')
      
      // Create web worker
      const worker = new Worker('/streaming-worker.js')
      
      // Set up worker message handling
      worker.onmessage = (e) => {
        const { type, data } = e.data
        
        switch (type) {
          case 'CONTENT_CHUNK':
            console.log('📝 [WORKER-MSG] Received content chunk')
            updateStreamingContent(data.content)
            break
            
          case 'REASONING_CHUNK':
            console.log('🧠 [WORKER-MSG] Received reasoning chunk')
            setStreamingReasoning(data.reasoning)
            break
            
          case 'STREAM_COMPLETE':
            console.log('✅ [WORKER-MSG] Stream completed')
            updateStreamingContent(data.content, true)
            
            const finalMessage: Message = {
              type: 'assistant',
              content: data.content,
              reasoning: data.reasoning
            }
            setMessages(prev => [...prev, finalMessage])
            setIsLoading(false)
            setIsStreaming(false)
            setStreamingContent('')
            setStreamingReasoning('')
            worker.terminate()
            break
            
          case 'ERROR':
            console.error('🚨 [WORKER-MSG] Error:', data.error)
            const errorMessage: Message = {
              type: 'assistant',
              content: `Sorry, I encountered an error: ${data.error}`
            }
            setMessages(prev => [...prev, errorMessage])
            setIsLoading(false)
            setIsStreaming(false)
            setStreamingContent('')
            setStreamingReasoning('')
            worker.terminate()
            break
        }
      }
      
      worker.onerror = (error) => {
        console.error('🚨 [WORKER] Worker error:', error)
        setIsLoading(false)
        setIsStreaming(false)
        setStreamingContent('')
        setStreamingReasoning('')
      }
      
      // Start the stream in the worker
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token
      
      if (!authToken) {
        throw new Error("No authentication token available")
      }
      
      worker.postMessage({
        type: 'START_STREAM',
        data: {
          url: "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/market-chat",
          options: {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: userMessage,
              chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n'),
              userId: user?.id,
              marketId,
              marketQuestion,
              selectedModel
            })
          }
        }
      })
      
      setIsStreaming(true)
      
    } catch (error: any) {
      console.error('🚨 [CHAT] Error setting up worker:', error)
      const errorMessage: Message = {
        type: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}`
      }
      setMessages(prev => [...prev, errorMessage])
      setIsLoading(false)
      setIsStreaming(false)
      setStreamingContent('')
      setStreamingReasoning('')
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