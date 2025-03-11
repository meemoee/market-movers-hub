
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
  const wsRef = useRef<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (isClosing || !clobTokenId) return;
    
    // Clean up previous connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    const connectWebSocket = async () => {
      try {
        setMessages(prev => [...prev, `Attempting connection at ${new Date().toISOString()}`]);
        setStatus("connecting");
        
        // Get the authentication headers
        const { data: { session } } = await supabase.auth.getSession();
        const headers = {
          apikey: supabase.supabaseKey,
          Authorization: `Bearer ${session?.access_token || supabase.supabaseKey}`,
        };
        
        // Create WebSocket URL with authentication
        const wsUrl = `wss://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws?assetId=${clobTokenId}`;
        setMessages(prev => [...prev, `WebSocket URL: ${wsUrl}`]);
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        // Connection opened
        ws.onopen = () => {
          setMessages(prev => [...prev, `🟢 Connection opened at ${new Date().toISOString()}`]);
          setStatus("connected");
          setError(null);
          
          // Send a test message
          const testMessage = JSON.stringify({ type: "ping", timestamp: new Date().toISOString() });
          ws.send(testMessage);
          setMessages(prev => [...prev, `SENT: ${testMessage}`]);
        };
        
        // Listen for messages
        ws.onmessage = (event) => {
          setMessages(prev => {
            const newMessages = [...prev, `RECEIVED: ${event.data}`];
            return newMessages.length > 50 ? newMessages.slice(-50) : newMessages;
          });
        };
        
        // Listen for errors
        ws.onerror = (event) => {
          setMessages(prev => [...prev, `🔴 WebSocket error at ${new Date().toISOString()}`]);
          setStatus("error");
          setError("Connection error");
          console.error("WebSocket error:", event);
        };
        
        // Connection closed
        ws.onclose = (event) => {
          setMessages(prev => [...prev, `🔴 Connection closed: code=${event.code}, reason=${event.reason || "No reason provided"}`]);
          setStatus("disconnected");
          wsRef.current = null;
        };
      } catch (err) {
        setMessages(prev => [...prev, `🔴 Error creating WebSocket: ${(err as Error).message}`]);
        setStatus("error");
        setError(`Failed to create connection: ${(err as Error).message}`);
      }
    };
    
    connectWebSocket();
    
    // Cleanup function
    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [clobTokenId, isClosing]);
  
  // Render loading state
  if (status === "connecting" && messages.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Connecting to WebSocket...</span>
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
                    if (wsRef.current) {
                      wsRef.current.close();
                      wsRef.current = null;
                    }
                    setStatus("connecting");
                    setMessages([]);
                  }
                }}
                className="px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs"
              >
                Reconnect
              </button>
            )}
            
            {status === "connected" && (
              <button 
                onClick={() => {
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    const testMessage = JSON.stringify({ 
                      type: "test", 
                      message: "This is a test message",
                      timestamp: new Date().toISOString() 
                    });
                    wsRef.current.send(testMessage);
                    setMessages(prev => [...prev, `SENT: ${testMessage}`]);
                  }
                }}
                className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 rounded-md text-xs"
              >
                Send Test
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
