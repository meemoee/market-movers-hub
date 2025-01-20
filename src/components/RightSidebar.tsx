import { Send, Zap, TrendingUp, DollarSign } from 'lucide-react'
import { useState } from 'react'
import { supabase } from "@/integrations/supabase/client"

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentSynthesis, setCurrentSynthesis] = useState('')

  interface Market {
    id: string
    question: string
    yes_price?: number
    volume?: number
  }

  interface Message {
    type: 'user' | 'assistant' | 'markets'
    content?: string
    markets?: Market[]
  }

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    
    setHasStartedChat(true)
    setIsLoading(true)
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    setCurrentSynthesis('')
    
    try {
      const { data, error } = await supabase.functions.invoke('market-analysis', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n')
        }
      })

      if (error) throw error
      if (!data) throw new Error('No response data')

      const lines = data.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsedData = JSON.parse(line.slice(5))
            
            if (parsedData.markets) {
              setMessages(prev => [...prev, { 
                type: 'markets', 
                markets: parsedData.markets
              }])
            }
            
            if (parsedData.type === 'synthesis') {
              setCurrentSynthesis(prev => prev + (parsedData.content || ''))
            }
          } catch (error) {
            console.error('Error parsing chunk:', error)
          }
        }
      }

      // After stream ends, add the complete synthesis message
      if (currentSynthesis) {
        setMessages(prev => [...prev, { 
          type: 'assistant', 
          content: currentSynthesis
        }])
      }
    } catch (error) {
      console.error('Error in chat:', error)
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }])
    } finally {
      setIsLoading(false)
      setCurrentSynthesis('')
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
                {message.type === 'markets' && message.markets ? (
                  <div className="space-y-2">
                    {message.markets.map((market, idx) => (
                      <div key={idx} className="text-sm">
                        <p className="font-medium">{market.question}</p>
                        <div className="text-xs text-gray-400 mt-1">
                          <span className="mr-3">Yes: {(market.yes_price || 0).toFixed(3)}</span>
                          <span>Volume: ${market.volume?.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white text-sm">{message.content}</p>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <p className="text-white text-sm">
                  {currentSynthesis || "Analyzing markets..."}
                </p>
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
