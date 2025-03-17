
import { Send } from 'lucide-react'
import { useState, useRef } from 'react'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Separator } from './ui/separator'

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  interface Message {
    type: 'user' | 'assistant'
    content?: string
    reasoning?: string
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
      let accumulatedReasoning = ''
      
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
              
              const lines = chunk.split('\n').filter(line => line.trim())
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  
                  if (jsonStr === '[DONE]') continue
                  
                  try {
                    const parsed = JSON.parse(jsonStr)
                    
                    const content = parsed.choices?.[0]?.delta?.content
                    const reasoning = parsed.choices?.[0]?.delta?.reasoning
                    
                    if (content) {
                      accumulatedContent += content
                      setStreamingContent(accumulatedContent)
                    }
                    
                    if (reasoning) {
                      accumulatedReasoning += reasoning
                      setStreamingReasoning(accumulatedReasoning)
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
        content: accumulatedContent,
        reasoning: accumulatedReasoning && accumulatedReasoning.trim() ? accumulatedReasoning : undefined
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
      setStreamingReasoning('')
      abortControllerRef.current = null
    }
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
            {messages.map((message, index) => (
              <div key={index} className="bg-[#2c2e33] p-3 rounded-lg">
                {message.type === 'user' ? (
                  <p className="text-white text-sm">{message.content}</p>
                ) : (
                  <div className="space-y-3">
                    <ReactMarkdown className="text-white text-sm prose prose-invert prose-sm max-w-none">
                      {message.content || ''}
                    </ReactMarkdown>
                    
                    {message.reasoning && (
                      <>
                        <Separator className="my-2 opacity-30" />
                        <div className="bg-[#232529] rounded p-2">
                          <div className="text-xs text-blue-300 mb-1">Model reasoning:</div>
                          <ReactMarkdown className="text-white text-xs prose prose-invert prose-sm max-w-none opacity-70">
                            {message.reasoning}
                          </ReactMarkdown>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {streamingContent && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <div className="space-y-3">
                  <ReactMarkdown className="text-white text-sm prose prose-invert prose-sm max-w-none">
                    {streamingContent}
                  </ReactMarkdown>
                  
                  {streamingReasoning && (
                    <>
                      <Separator className="my-2 opacity-30" />
                      <div className="bg-[#232529] rounded p-2">
                        <div className="text-xs text-blue-300 mb-1">Model reasoning:</div>
                        <ReactMarkdown className="text-white text-xs prose prose-invert prose-sm max-w-none opacity-70">
                          {streamingReasoning}
                        </ReactMarkdown>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {isLoading && !streamingContent && !streamingReasoning && (
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
