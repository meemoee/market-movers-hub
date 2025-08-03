import { MessageCircle, Send } from 'lucide-react'
import { useState, useRef } from 'react'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Card } from "@/components/ui/card"
import { useCurrentUser } from "@/hooks/useCurrentUser"

interface MarketChatboxProps {
  marketId: string
  marketQuestion: string
}

interface Message {
  type: 'user' | 'assistant'
  content?: string
}

export function MarketChatbox({ marketId, marketQuestion }: MarketChatboxProps) {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const { user } = useCurrentUser()

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

      const { data, error } = await supabase.functions.invoke('market-chat', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n'),
          userId: user?.id,
          marketId,
          marketQuestion
        }
      })

      if (error) {
        console.error('Supabase function error:', error)
        throw error
      }

      console.log('Received response from market-chat:', {
        hasData: !!data,
        hasBody: !!data?.body,
        bodyType: typeof data?.body,
        isReadableStream: data?.body instanceof ReadableStream
      })
      
      let accumulatedContent = ''
      
      console.log('Processing response stream directly...')
      const textDecoder = new TextDecoder()
      const reader = new Response(data.body).body?.getReader()
      
      console.log('Reader created:', !!reader)
      
      function processStream() {
        console.log('Reading next chunk from stream...')
        reader?.read().then(({done, value}) => {
          console.log('Stream read result:', { done, chunkSize: value?.length })
          
          if (done) {
            console.log('Stream complete, adding final message')
            setMessages(prev => [...prev, { 
              type: 'assistant', 
              content: accumulatedContent 
            }])
            return
          }
          
          const chunk = textDecoder.decode(value)
          console.log('Decoded chunk:', chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''))
          
          const lines = chunk.split('\n').filter(line => line.trim())
          console.log('Filtered lines:', lines.length, lines)
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            console.log(`Processing line ${i}:`, line.substring(0, 100))
            
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim()
              console.log('Extracted JSON string:', jsonStr)
              
              if (jsonStr === '[DONE]') {
                console.log('Found DONE signal, skipping')
                continue
              }
              
              try {
                const parsed = JSON.parse(jsonStr)
                console.log('Parsed JSON:', parsed)
                
                const content = parsed.choices?.[0]?.delta?.content
                console.log('Extracted content:', content)
                
                if (content) {
                  accumulatedContent += content
                  console.log('Accumulated content length:', accumulatedContent.length)
                  console.log('Current accumulated content:', accumulatedContent.substring(0, 100) + '...')
                  
                  setStreamingContent(accumulatedContent)
                  console.log('Updated streaming content in UI')
                } else {
                  console.log('No content in this chunk')
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr)
              }
            } else {
              console.log('Line does not start with "data:", skipping:', line)
            }
          }
          
          console.log('Finished processing chunk, continuing to next...')
          processStream()
        }).catch(error => {
          console.error('Error reading from stream:', error)
        })
      }
      
      console.log('Starting stream processing...')
      processStream()

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
            <div key={index} className="bg-muted/50 p-3 rounded-lg">
              {message.type === 'user' ? (
                <p className="text-sm font-medium">{message.content}</p>
              ) : (
                <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                  {message.content || ''}
                </ReactMarkdown>
              )}
            </div>
          ))}
          {streamingContent && (
            <div className="bg-muted/50 p-3 rounded-lg">
              <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                {streamingContent}
              </ReactMarkdown>
            </div>
          )}
          {isLoading && !streamingContent && (
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">Thinking...</p>
            </div>
          )}
        </div>
      )}
      
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