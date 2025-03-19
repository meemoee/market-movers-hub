
import { Send } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Separator } from './ui/separator'
import { v4 as uuidv4 } from 'uuid'

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  interface Message {
    type: 'user' | 'assistant'
    content?: string
  }

  // Set up realtime subscription for streaming content
  useEffect(() => {
    if (!currentJobId) return

    console.log(`Setting up chat message realtime subscription for job ${currentJobId}`)
    
    const channel = supabase
      .channel('chat-stream')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analysis_stream',
          filter: `job_id=eq.${currentJobId}`
        },
        (payload) => {
          console.log('Received chat chunk:', payload)
          const newChunk = payload.new.chunk
          
          setStreamingContent(prev => prev + newChunk)
        }
      )
      .subscribe()
    
    return () => {
      console.log('Cleaning up chat realtime subscription')
      supabase.removeChannel(channel)
    }
  }, [currentJobId])

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    
    setHasStartedChat(true)
    setIsLoading(true)
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    setStreamingContent('')
    
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Generate a unique job ID for this chat message
      const jobId = uuidv4()
      setCurrentJobId(jobId)

      console.log('Sending request to simulated-stream function...')
      const { data, error } = await supabase.functions.invoke('simulated-stream', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n'),
          jobId: jobId,
          iteration: 0
        }
      })

      if (error) {
        console.error('Supabase function error:', error)
        throw error
      }

      console.log('Received response from simulated-stream:', data)
      
      // No need to process streaming here, it's handled by the realtime subscription
      
    } catch (error) {
      console.error('Error in chat:', error)
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }])
      setCurrentJobId(null)
    }
  }

  // When streaming content is complete, add it to messages
  useEffect(() => {
    if (!isLoading || !streamingContent || !currentJobId) return
    
    // Check if there's been no updates to streaming content for 2 seconds
    const timer = setTimeout(() => {
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: streamingContent 
      }])
      setStreamingContent('')
      setCurrentJobId(null)
      setIsLoading(false)
    }, 2000)
    
    return () => clearTimeout(timer)
  }, [streamingContent, isLoading])

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
  );
}
