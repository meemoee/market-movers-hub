
import { Send } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { supabase } from "@/integrations/supabase/client"
import { Markdown } from './Markdown'
import { Separator } from './ui/separator'

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const chatSessionIdRef = useRef<string>(`chat-session-${Date.now()}`)
  const retryTimeoutRef = useRef<number | null>(null)

  interface Message {
    type: 'user' | 'assistant'
    content?: string
    id?: string // Add unique ID for each message
  }

  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('chatMessages')
      const savedStreamingContent = localStorage.getItem('streamingContent')
      const hasStarted = localStorage.getItem('hasStartedChat')
      
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages))
      }
      
      if (savedStreamingContent) {
        setStreamingContent(savedStreamingContent)
        setIsReconnecting(true)
      }
      
      if (hasStarted === 'true') {
        setHasStartedChat(true)
      }
    } catch (error) {
      console.error('Error loading saved chat state:', error)
    }
  }, [])

  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem('chatMessages', JSON.stringify(messages))
        localStorage.setItem('hasStartedChat', String(hasStartedChat))
      }
    } catch (error) {
      console.error('Error saving chat messages:', error)
    }
  }, [messages, hasStartedChat])

  useEffect(() => {
    try {
      if (streamingContent) {
        localStorage.setItem('streamingContent', streamingContent)
      } else {
        localStorage.removeItem('streamingContent')
      }
    } catch (error) {
      console.error('Error saving streaming content:', error)
    }
  }, [streamingContent])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (streamingContent && isLoading) {
        localStorage.setItem('streamingContent', streamingContent)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [streamingContent, isLoading])

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network is back online')
      if (isLoading && streamingContent) {
        setIsReconnecting(true)
      }
    }
    
    const handleOffline = () => {
      console.log('Network is offline')
      setStreamError('Network connection lost. Waiting to reconnect...')
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isLoading, streamingContent])

  useEffect(() => {
    if (isReconnecting && streamingContent) {
      const completeMessage = async () => {
        try {
          setIsLoading(true)
          setMessages(prev => [...prev, { 
            type: 'assistant' as const, 
            content: streamingContent,
            id: `msg-${Date.now()}`
          }])
          setStreamingContent('')
          setIsReconnecting(false)
          setStreamError(null)
        } catch (error) {
          console.error('Error handling reconnection:', error)
        } finally {
          setIsLoading(false)
        }
      }
      
      completeMessage()
    }
  }, [isReconnecting, streamingContent])

  const retryStreamConnection = (userMessage: string) => {
    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
    }
    
    console.log('Retrying stream connection...')
    setStreamError('Reconnecting...')
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Retry after a short delay
    retryTimeoutRef.current = window.setTimeout(() => {
      handleChatMessage(userMessage, true)
    }, 2000)
  }

  const handleChatMessage = async (userMessage: string, isRetry = false) => {
    if ((!userMessage.trim() && !isRetry) || isLoading) return
    
    if (!isRetry) {
      setHasStartedChat(true)
      
      const newMessages = [...messages, { 
        type: 'user' as const, 
        content: userMessage,
        id: `msg-${Date.now()}`
      }]
      
      setMessages(newMessages)
      setChatMessage('')
    }
    
    setStreamError(null)
    setIsLoading(true)
    
    let lastMessageTime = Date.now()
    let accumulatedContent = isRetry ? streamingContent : ''
    
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()

      console.log('Sending request to market-analysis function...')
      const { data, error } = await supabase.functions.invoke('market-analysis', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n'),
          sessionId: chatSessionIdRef.current
        }
      })

      if (error) {
        console.error('Supabase function error:', error)
        throw error
      }

      console.log('Received response from market-analysis:', data)
      
      // Setup a heartbeat check to detect stalled streams
      const heartbeatInterval = setInterval(() => {
        const currentTime = Date.now()
        const timeSinceLastMessage = currentTime - lastMessageTime
        
        // If no message received for 15 seconds, attempt to retry
        if (timeSinceLastMessage > 15000 && isLoading) {
          console.warn('Stream appears stalled, reconnecting...')
          clearInterval(heartbeatInterval)
          retryStreamConnection(userMessage)
        }
      }, 5000)
      
      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(data.body).body?.getReader()
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                console.log('Stream complete')
                clearInterval(heartbeatInterval)
                controller.close()
                return
              }
              
              // Update the last message time on each chunk
              lastMessageTime = Date.now()
              
              const chunk = textDecoder.decode(value)
              
              const lines = chunk.split('\n').filter(line => line.trim())
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  
                  if (jsonStr === '[DONE]') continue
                  
                  try {
                    const parsed = JSON.parse(jsonStr)
                    
                    const content = parsed.choices?.[0]?.delta?.content
                    if (content) {
                      accumulatedContent += content
                      setStreamingContent(accumulatedContent)
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr)
                  }
                }
              }
              
              push()
            }).catch(error => {
              clearInterval(heartbeatInterval)
              console.error('Error reading stream:', error)
              
              // Only retry if we're still loading and the error isn't an abort
              if (isLoading && error.name !== 'AbortError') {
                setStreamError('Stream interrupted. Reconnecting...')
                retryStreamConnection(userMessage)
              }
              
              controller.error(error)
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

      // Clear the heartbeat check
      clearInterval(heartbeatInterval)

      setMessages(prev => [...prev, { 
        type: 'assistant' as const, 
        content: accumulatedContent,
        id: `msg-${Date.now()}`
      }])

    } catch (error) {
      console.error('Error in chat:', error)
      
      // If we already have accumulated content but hit an error, save the partial response
      if (accumulatedContent.length > 0) {
        console.log('Saving partial response of length:', accumulatedContent.length)
        setMessages(prev => [...prev, { 
          type: 'assistant' as const, 
          content: accumulatedContent,
          id: `msg-${Date.now()}`
        }])
      } else {
        setMessages(prev => [...prev, { 
          type: 'assistant' as const, 
          content: 'Sorry, I encountered an error processing your request.',
          id: `msg-${Date.now()}`
        }])
      }
    } finally {
      setIsLoading(false)
      setStreamingContent('')
      abortControllerRef.current = null
      localStorage.removeItem('streamingContent')
    }
  }

  const clearChat = () => {
    setMessages([])
    setStreamingContent('')
    setHasStartedChat(false)
    setStreamError(null)
    localStorage.removeItem('chatMessages')
    localStorage.removeItem('streamingContent')
    localStorage.removeItem('hasStartedChat')
    chatSessionIdRef.current = `chat-session-${Date.now()}`
  }

  const defaultContent = [
    {
      question: "Turn your 💬 into 💰",
      answer: "Hunchex will find market positions that correspond to the comments you make, allowing you to track their truthfulness over time.",
    }
  ]

  return (
    <aside className="fixed top-0 right-0 h-screen w-[400px] bg-[#1a1b1e]/70 backdrop-blur-md z-[999] border-l border-white/10 hidden xl:block">
      <div className="p-6 overflow-y-auto h-full">
        {!hasStartedChat ? (
          <>
            <div className="mb-12">
              <h2 className="text-3xl font-extrabold whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                A New Game
              </h2>
              <h2 className="text-3xl font-extrabold whitespace-nowrap overflow-hidden text-ellipsis bg-gradient-to-r from-[#7E69AB] via-[#9b87f5] to-[#D946EF] text-transparent bg-clip-text">
                For a New Age
              </h2>
            </div>
            {defaultContent.map((item, index) => (
              <div key={index} className="mb-6">
                <h3 className="text-xl font-semibold mb-2">{item.question}</h3>
                <p className="text-gray-400 text-base">{item.answer}</p>
              </div>
            ))}
          </>
        ) : (
          <div className="space-y-4 mb-20">
            {messages.length > 0 && (
              <div className="flex justify-end mb-2">
                <button 
                  onClick={clearChat}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Clear Chat
                </button>
              </div>
            )}
            
            {messages.map((message) => (
              <div key={message.id} className="bg-[#2c2e33] p-3 rounded-lg">
                {message.type === 'user' ? (
                  <p className="text-white text-sm">{message.content}</p>
                ) : (
                  <Markdown>
                    {message.content || ''}
                  </Markdown>
                )}
              </div>
            ))}
            {streamingContent && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <Markdown>
                  {streamingContent}
                  <span className="animate-pulse">▌</span>
                </Markdown>
              </div>
            )}
            {streamError && (
              <div className="bg-red-900/20 border border-red-900 p-2 rounded text-xs text-red-300">
                {streamError}
              </div>
            )}
            {isLoading && !streamingContent && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <p className="text-white text-sm">Thinking...</p>
              </div>
            )}
          </div>
        )}
        
        <div className="fixed bottom-0 right-0 w-[400px] p-4">
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
              placeholder="What do you believe?"
              className="flex-grow p-2 bg-[#2c2e33] border border-[#4a4b50] rounded-lg text-white text-sm"
            />
            <button 
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-blue-500"
              onClick={() => handleChatMessage(chatMessage)}
              disabled={isLoading}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
