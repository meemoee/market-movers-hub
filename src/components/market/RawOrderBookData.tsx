
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
}

export function RawOrderBookData({ clobTokenId, isClosing }: RawOrderBookProps) {
  const [status, setStatus] = useState<string>("disconnected");
  const [messages, setMessages] = useState<string[]>([]);
  const pollingRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (isClosing || !clobTokenId) return;
    
    // Clear previous polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    
    const fetchOrderBookData = async () => {
      try {
        setStatus("connecting");
        const timestamp = new Date().toISOString();
        setMessages(prev => [...prev, `Fetching data at ${timestamp}`]);
        
        // First try the new polymarket-stream function which uses WebSockets
        const { data: streamData, error: streamError } = await supabase.functions.invoke('polymarket-stream', {
          body: { tokenId: clobTokenId }
        });
        
        if (streamError) {
          console.log("WebSocket stream failed, falling back to REST API:", streamError);
          // Fall back to the REST API
          const { data: restData, error: restError } = await supabase.functions.invoke('get-orderbook', {
            body: { tokenId: clobTokenId }
          });
          
          if (restError) {
            setMessages(prev => [...prev, `🔴 Error fetching data: ${restError.message}`]);
            setStatus("error");
            setError(restError.message);
            return;
          }
          
          processData(restData);
        } else {
          processData(streamData);
        }
      } catch (err) {
        setMessages(prev => [...prev, `🔴 Error: ${(err as Error).message}`]);
        setStatus("error");
        setError(`Failed to fetch data: ${(err as Error).message}`);
      }
    };
    
    const processData = (data: any) => {
      // Process the received data
      setStatus("connected");
      setError(null);
      setMessages(prev => {
        const newMessages = [...prev, `RECEIVED: ${JSON.stringify(data)}`];
        return newMessages.length > 50 ? newMessages.slice(-50) : newMessages;
      });
    };
    
    // Initial fetch
    fetchOrderBookData();
    
    // Set up polling every 3 seconds
    pollingRef.current = window.setInterval(fetchOrderBookData, 3000);
    
    // Cleanup function
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [clobTokenId, isClosing]);
  
  // Render loading state
  if (status === "connecting" && messages.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Fetching data...</span>
      </div>
    );
  }
  
  // Render data display
  return (
    <div className="h-[300px] overflow-y-auto bg-background/50 border border-border rounded-md p-2">
      <div className="text-xs font-mono">
        <div className="sticky top-0 bg-background/90 mb-2 py-1 border-b border-border">
          Status: <span className={
            status === "connected" ? "text-green-500" :
            status === "connecting" ? "text-yellow-500" :
            status === "error" ? "text-red-500" :
            "text-muted-foreground"
          }>{status}</span>
          {error && <span className="text-red-500 ml-2">Error: {error}</span>}
          
          <div className="flex flex-wrap gap-1 mt-1">
            {(status === "error" || status === "disconnected") && (
              <button 
                onClick={() => {
                  if (clobTokenId) {
                    setStatus("connecting");
                    setMessages([]);
                  }
                }}
                className="px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs"
              >
                Retry
              </button>
            )}
            
            {status === "connected" && (
              <button 
                onClick={() => {
                  setMessages(prev => [...prev, `Manual refresh at ${new Date().toISOString()}`]);
                  // Force an immediate refresh
                  if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                  }
                  
                  // First try the WebSocket approach
                  supabase.functions.invoke('polymarket-stream', {
                    body: { tokenId: clobTokenId }
                  }).then(({ data, error }) => {
                    if (error) {
                      console.log("WebSocket stream failed, falling back to REST API:", error);
                      // Fall back to the REST API
                      return supabase.functions.invoke('get-orderbook', {
                        body: { tokenId: clobTokenId }
                      });
                    }
                    return { data, error };
                  }).then(({ data, error }) => {
                    if (error) {
                      setMessages(prev => [...prev, `🔴 Error fetching data: ${error.message}`]);
                      return;
                    }
                    setMessages(prev => {
                      const newMessages = [...prev, `RECEIVED: ${JSON.stringify(data)}`];
                      return newMessages.length > 50 ? newMessages.slice(-50) : newMessages;
                    });
                    // Restart the polling
                    pollingRef.current = window.setInterval(() => {
                      supabase.functions.invoke('polymarket-stream', {
                        body: { tokenId: clobTokenId }
                      }).then(({ data, error }) => {
                        if (error) {
                          // Fall back to REST API if WebSocket fails
                          return supabase.functions.invoke('get-orderbook', {
                            body: { tokenId: clobTokenId }
                          });
                        }
                        return { data, error };
                      }).then(({ data, error }) => {
                        if (!error) {
                          setMessages(prev => {
                            const newMessages = [...prev, `RECEIVED: ${JSON.stringify(data)}`];
                            return newMessages.length > 50 ? newMessages.slice(-50) : newMessages;
                          });
                        }
                      });
                    }, 3000);
                  });
                }}
                className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 rounded-md text-xs"
              >
                Refresh Now
              </button>
            )}
          </div>
        </div>
        
        <div className="space-y-1 whitespace-pre-wrap break-all">
          {messages.length === 0 ? (
            <div className="text-muted-foreground">Waiting for data...</div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className="border-b border-border/30 pb-1 mb-1 text-[11px]">
                {message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
