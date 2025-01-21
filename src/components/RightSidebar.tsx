import { Send, Zap, TrendingUp, DollarSign } from 'lucide-react'
import { useState, useRef } from 'react'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  interface Message {
    type: 'user' | 'assistant'
    content?: string
  }

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    
    setHasStartedChat(true)
    setIsLoading(true)
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()

      console.log('Sending request to market-analysis function...')
      const { data, error } = await supabase.functions.invoke('market-analysis', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n')
        }
      })

      if (error) {
        console.error('Supabase function error:', error)
        throw error
      }

      console.log('Received response from market-analysis:', data)
      
      let accumulatedContent = ''
      
      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(data.body).body?.getReader()
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                console.log('Stream complete')
                controller.close()
                return
              }
              
              const chunk = textDecoder.decode(value)
              console.log('Received chunk:', chunk)
              
              const lines = chunk.split('\n').filter(line => line.trim())
              console.log('Processing lines:', lines)
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  console.log('Processing JSON string:', jsonStr)
                  
                  if (jsonStr === '[DONE]') continue
                  
                  try {
                    const parsed = JSON.parse(jsonStr)
                    console.log('Parsed JSON:', parsed)
                    
                    const content = parsed.choices?.[0]?.delta?.content
                    if (content) {
                      console.log('New content chunk:', content)
                      accumulatedContent += content
                      setStreamingContent(accumulatedContent)
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr)
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

      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: accumulatedContent 
      }])

    } catch (error) {
      console.error('Error in chat:', error)
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }])
    } finally {
      setIsLoading(false)
      setStreamingContent('')
      abortControllerRef.current = null
    }
  }

  const defaultContent = [
    {
      icon: Zap,
      question: "Use AI to turn your opinions into portfolios",
      answer: "Hunchex will find relevant markets to what you say and track their performance over time.",
      subPoints: [
        { icon: TrendingUp, text: "Track price changes in real-time" },
        { icon: DollarSign, text: "Identify profitable opportunities" }
      ]
    },
    {
      icon: TrendingUp,
      question: "What are Top Movers?",
      answer: "Markets with significant price changes",
      subPoints: [
        { icon: Zap, text: "Filter by time intervals" },
        { icon: DollarSign, text: "Sort by price movement %" }
      ]
    },
    {
      icon: DollarSign,
      question: "How to trade?",
      answer: "Simple steps to start trading",
      subPoints: [
        { icon: TrendingUp, text: "Login to your account" },
        { icon: Zap, text: "Select a market and place orders" }
      ]
    }
  ]

  return (
    <aside className="fixed top-14 right-0 h-[calc(100vh-56px)] w-[400px] bg-[#1a1b1e]/70 backdrop-blur-md z-[999] border-l border-white/10 hidden xl:block">
      <div className="p-6 overflow-y-auto h-full">
        {!hasStartedChat ? (
          <>
            <h2 className="text-xl font-bold mb-6 whitespace-nowrap overflow-hidden text-ellipsis">
              Turn your 💬 into 💰
            </h2>
            {defaultContent.map((item, index) => (
              <div key={index} className="mb-6 pb-6 border-b border-white/10 last:border-0">
                <div className="flex items-center mb-2">
                  <span className="mr-3 text-blue-500">
                    <item.icon size={16} />
                  </span>
                  <h3 className="text-sm font-semibold">{item.question}</h3>
                </div>
                <p className="text-gray-400 text-sm ml-9 mb-2">{item.answer}</p>
                <div className="space-y-1 ml-9">
                  {item.subPoints.map((subPoint, subIndex) => (
                    <div key={subIndex} className="flex items-center">
                      <span className="mr-2 text-blue-500">
                        <subPoint.icon size={12} />
                      </span>
                      <span className="text-xs text-gray-400">{subPoint.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="space-y-4 mb-20">
            {messages.map((message, index) => (
              <div key={index} className="bg-[#2c2e33] p-3 rounded-lg">
                {message.type === 'user' ? (
                  <p className="text-white text-sm">{message.content}</p>
                ) : (
                  <ReactMarkdown className="text-white text-sm prose prose-invert prose-sm max-w-none">
                    {message.content || ''}
                  </ReactMarkdown>
                )}
              </div>
            ))}
            {streamingContent && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <ReactMarkdown className="text-white text-sm prose prose-invert prose-sm max-w-none">
                  {streamingContent}
                </ReactMarkdown>
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
  )
}
