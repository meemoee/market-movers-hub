
import { Send } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Separator } from './ui/separator'
import { useStreamingContent } from '@/hooks/useStreamingContent'
import { toast } from 'sonner'
import { StreamingContentDisplay } from '@/components/market/research/StreamingContentDisplay'

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Use our improved streaming hook
  const { 
    content: streamingContent, 
    isStreaming, 
    rawBuffer,
    displayPosition,
    startStreaming,
    addChunk, 
    stopStreaming 
  } = useStreamingContent()

  interface Message {
    type: 'user' | 'assistant'
    content?: string
  }

  // Set a timeout detection for API response
  useEffect(() => {
    let streamTimeout: ReturnType<typeof setTimeout> | null = null;
    
    if (isLoading && isStreaming) {
      // Set a 10-second timeout to detect if we're not receiving chunks
      streamTimeout = setTimeout(() => {
        if (rawBuffer && rawBuffer.length === 0) {
          console.error('No streaming content received after 10 seconds');
          setStreamError('No response received from the API. Please try again.');
          
          // Automatically cancel the request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
        }
      }, 10000);
    }
    
    return () => {
      if (streamTimeout) clearTimeout(streamTimeout);
    };
  }, [isLoading, isStreaming, rawBuffer]);
  
  const handleRetry = () => {
    // Clear any previous errors
    setStreamError(null);
    
    // Retry the last user message if available
    const lastUserMessage = messages.filter(m => m.type === 'user').pop();
    if (lastUserMessage?.content) {
      handleChatMessage(lastUserMessage.content);
    } else {
      toast.error('No previous message to retry');
    }
  };

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    
    setHasStartedChat(true)
    setIsLoading(true)
    setStreamError(null)
    
    // Add user message immediately
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()

      console.log('Sending request to market-analysis function...')
      
      // Start streaming mode before making the request
      startStreaming()
      
      const startTime = Date.now();
      console.log(`REQUEST_START: ${new Date().toISOString()}`);
      
      // Pass signal in the body instead of as an option
      const { data, error } = await supabase.functions.invoke('market-analysis', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n'),
          signal: abortControllerRef.current.signal
        }
      })

      console.log(`REQUEST_COMPLETE: ${new Date().toISOString()}, elapsed: ${Date.now() - startTime}ms`);
      
      if (error) {
        console.error('Supabase function error:', error)
        throw error
      }

      console.log('Received response stream from market-analysis')
      
      if (!data?.body) {
        throw new Error('No response body received')
      }
      
      // Process the SSE stream with improved handling
      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(data.body).body?.getReader()
          let receivedFirstChunk = false;
          let chunkCounter = 0;
          let buffer = '';
          let lastEventTime = Date.now();
          
          console.log('Starting to read stream from Edge Function');
          
          // Improved function to process SSE events and extract delta content
          const processEvent = (event: string) => {
            if (event.trim() === '') return;
            
            // Log full event for debugging if it's short, otherwise log a summary
            if (event.length < 100) {
              console.log(`SSE Event (full): ${event}`);
            } else {
              console.log(`SSE Event: ${event.substring(0, 50)}... (${event.length} chars)`);
            }
            
            if (event.startsWith('data: ')) {
              const jsonStr = event.slice(6).trim();
              lastEventTime = Date.now();
              
              if (jsonStr === '[DONE]') {
                console.log('Stream complete [DONE] marker received');
                return;
              }
              
              try {
                const parsed = JSON.parse(jsonStr);
                
                // Check if this contains an error
                if (parsed.error) {
                  console.error('Stream error received:', parsed.error);
                  setStreamError(parsed.error);
                  return;
                }
                
                const content = parsed.choices?.[0]?.delta?.content;
                
                if (content) {
                  receivedFirstChunk = true;
                  console.log(`Content chunk received: ${content.length} chars, preview: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`);
                  
                  // Add the chunk to our streaming content
                  addChunk(content);
                } else {
                  console.log('Received SSE event with no content delta');
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr);
              }
            } else if (event.startsWith(':')) {
              // Heartbeat event
              console.log('Received heartbeat');
              lastEventTime = Date.now(); // Update last event time on heartbeats too
            } else {
              console.log(`Received unknown event format: ${event}`);
            }
          };
          
          // Push function to process chunks
          function push() {
            if (!reader) {
              controller.error(new Error('Stream reader is undefined'));
              return;
            }
            
            reader.read().then(({done, value}) => {
              if (done) {
                console.log('Stream reader complete');
                // Try to process any remaining buffer content
                if (buffer.trim()) {
                  console.log(`Processing final buffer content: ${buffer.length} chars`);
                  const events = buffer.split('\n\n');
                  events.forEach(event => {
                    if (event.trim()) {
                      processEvent(event.trim());
                    }
                  });
                }
                controller.close();
                return;
              }
              
              chunkCounter++;
              const chunk = textDecoder.decode(value, { stream: true });
              const now = Date.now();
              console.log(`Received chunk #${chunkCounter} of ${chunk.length} bytes at ${new Date().toISOString()}`);
              
              // Check for inactivity
              const timeSinceLastEvent = now - lastEventTime;
              if (chunkCounter > 1 && timeSinceLastEvent > 5000) {
                console.warn(`No events processed for ${timeSinceLastEvent}ms`);
              }
              
              // Combine with any previous buffer and split by SSE delimiter
              buffer += chunk;
              const events = buffer.split('\n\n');
              
              // Process all complete events (all but the last one)
              for (let i = 0; i < events.length - 1; i++) {
                if (events[i].trim()) {
                  console.log(`Processing event #${i+1} of ${events.length-1} from chunk #${chunkCounter}`);
                  processEvent(events[i].trim());
                }
              }
              
              // Keep the last (potentially incomplete) event in the buffer
              buffer = events[events.length - 1];
              
              // Check if we've received our first content chunk yet
              if (chunkCounter > 3 && !receivedFirstChunk) {
                console.warn(`Received ${chunkCounter} chunks but no content yet!`);
              }
              
              push();
            }).catch(err => {
              // Don't report abort errors as they're expected when canceling
              if (err.name === 'AbortError') {
                console.log('Stream reading was aborted');
              } else {
                console.error('Error reading from stream:', err);
                setStreamError(`Error: ${err.message}`);
                controller.error(err);
              }
            });
          }
          
          push();
        }
      });

      // Read the stream to completion
      const reader = stream.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
        console.log('Finished reading entire stream');
      } catch (err) {
        console.error('Error consuming stream:', err);
        // Only set error if not already set and it's not an abort error
        if (!streamError && err.name !== 'AbortError') {
          setStreamError(`Error: ${err.message}`);
        }
      } finally {
        reader.releaseLock();
      }

      // When stream is complete, add the message to history
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: rawBuffer || streamingContent || '(No response received)' 
      }]);

    } catch (error: any) {
      console.error('Error in chat:', error);
      
      // Don't show error toast for aborts, as they're user-initiated
      if (error.name !== 'AbortError') {
        toast.error('Error processing your request');
        setStreamError(null); // Clear any stream-specific error
        setMessages(prev => [...prev, { 
          type: 'assistant', 
          content: 'Sorry, I encountered an error processing your request.' 
        }]);
      }
    } finally {
      setIsLoading(false);
      stopStreaming();
      abortControllerRef.current = null;
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
                  <ReactMarkdown className="text-white text-sm prose prose-invert prose-sm max-w-none">
                    {message.content || ''}
                  </ReactMarkdown>
                )}
              </div>
            ))}
            
            {/* Show streaming content using StreamingContentDisplay component */}
            {isStreaming && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <StreamingContentDisplay 
                  content={streamingContent}
                  isStreaming={isStreaming}
                  maxHeight="200px" 
                  rawBuffer={rawBuffer}
                  displayPosition={displayPosition}
                />
              </div>
            )}
            
            {/* Show stream error if any */}
            {streamError && (
              <div className="bg-[#3a2028] border border-red-900/50 p-3 rounded-lg">
                <p className="text-red-400 text-sm mb-2">{streamError}</p>
                <button 
                  onClick={handleRetry}
                  className="text-xs px-3 py-1 bg-red-900/30 hover:bg-red-900/50 rounded-md text-red-300 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
            
            {isLoading && !isStreaming && (
              <div className="bg-[#2c2e33] p-3 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </div>
                  <p className="text-white text-sm">Thinking...</p>
                </div>
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
              disabled={isLoading}
            />
            <button 
              className={`p-2 ${isLoading ? 'text-gray-500' : 'text-blue-500 hover:bg-white/10'} rounded-lg transition-colors`}
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
