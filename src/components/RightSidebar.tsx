import { Send, Zap, TrendingUp, DollarSign } from 'lucide-react'
import { useState, useRef } from 'react'
import { supabase } from "@/integrations/supabase/client"

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  interface Message {
    type: 'user' | 'assistant'
    content?: string
  }

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    
    console.log('Starting chat message handling with:', userMessage)
    setHasStartedChat(true)
    setIsLoading(true)
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    
    try {
      // Cancel any ongoing stream
      if (abortControllerRef.current) {
        console.log('Cancelling previous request')
        abortControllerRef.current.abort()
      }

      console.log('Invoking market-analysis function...')
      const { data: response, error } = await supabase.functions.invoke('market-analysis', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n')
        }
      })

      // Log the complete response object
      console.log('Complete response object:', response)
      console.log('Response type:', typeof response)
      console.log('Response constructor:', response?.constructor?.name)
      
      if (error) {
        console.error('Supabase function error:', error)
        throw error
      }

      // Initialize new assistant message
      console.log('Initializing new assistant message')
      setMessages(prev => {
        console.log('Previous messages:', prev)
        return [...prev, { type: 'assistant', content: '' }]
      })

      if (typeof response === 'string') {
        console.log('Response is a string, length:', response.length)
        const lines = response.split('\n').filter(line => line.trim() !== '')
        console.log('Split response into lines:', lines)
        console.log('Number of lines:', lines.length)
        
        let accumulatedContent = ''
        
        for (const line of lines) {
          console.log('Raw line:', line)
          console.log('Line type:', typeof line)
          console.log('Line length:', line.length)
          
          if (!line.startsWith('data: ')) {
            console.log('Line does not start with "data: ":', line)
            continue
          }
          
          const data = line.slice(5).trim()
          console.log('Extracted data after slice:', data)
          console.log('Data length:', data.length)
          
          if (data === '[DONE]') {
            console.log('Received [DONE] signal')
            continue
          }
          
          try {
            console.log('About to parse JSON:', data)
            const parsed = JSON.parse(data)
            console.log('Successfully parsed JSON:', parsed)
            console.log('Parsed object keys:', Object.keys(parsed))
            
            const content = parsed.choices?.[0]?.delta?.content || ''
            console.log('Extracted content:', content)
            console.log('Content type:', typeof content)
            console.log('Content length:', content.length)
            
            if (content) {
              accumulatedContent += content
              console.log('Updated accumulated content:', accumulatedContent)
              console.log('Accumulated content length:', accumulatedContent.length)
              
              setMessages(prev => {
                console.log('Updating messages state')
                console.log('Current messages:', prev)
                const newMessages = [...prev]
                const lastMessage = newMessages[newMessages.length - 1]
                if (lastMessage.type === 'assistant') {
                  console.log('Previous content:', lastMessage.content)
                  lastMessage.content = accumulatedContent
                  console.log('Updated content:', lastMessage.content)
                }
                return newMessages
              })
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e)
            console.error('Failed to parse data:', data)
          }
        }
      } else {
        console.error('Unexpected response format:', response)
        throw new Error('Unexpected response format from market-analysis function')
      }

    } catch (error) {
      console.error('Error in chat:', error)
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }])
    } finally {
      console.log('Chat handling complete')
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const defaultContent = [
    {
      icon: Zap,
      question: "How does it work?",
      answer: "Get instant insights on market movements",
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
                <p className="text-white text-sm">{message.content}</p>
              </div>
            ))}
            {isLoading && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <p className="text-white text-sm">Thinking...</p>
              </div>
            )}
          </div>
        )}
        
        {/* Chat Input */}
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