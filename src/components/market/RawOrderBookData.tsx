
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
}

// Get the Supabase anon key from the client
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc";

export function RawOrderBookData({ clobTokenId, isClosing }: RawOrderBookProps) {
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef<boolean>(true);
  const reconnectAttemptRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  
  // Basic HTTP test to check Edge Function availability
  useEffect(() => {
    const testEndpoint = async () => {
      try {
        const baseUrl = "https://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws";
        setRawData(prev => [...prev, `Testing connection to: ${baseUrl}`]);
        
        // Call the edge function using the x-client-info header for test mode
        const { data, error } = await supabase.functions.invoke('polymarket-ws', {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'x-client-info': 'test-mode',
            'apikey': SUPABASE_ANON_KEY
          }
        });

        if (error) {
          setRawData(prev => [...prev, `❌ Edge Function error: ${error.message}`]);
          setError(`Edge Function error: ${error.message}`);
          return;
        }
        
        setRawData(prev => [...prev, `✅ Edge Function response: ${JSON.stringify(data)}`]);
        setRawData(prev => [...prev, `✅ Edge Function is accessible`]);
      } catch (err) {
        setRawData(prev => [...prev, `❌ Could not access Edge Function: ${(err as Error).message}`]);
        setError(`Network error: ${(err as Error).message}`);
      }
    };
    
    if (clobTokenId && !isClosing) {
      testEndpoint();
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [clobTokenId, isClosing]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    // Skip if closing or no tokenId
    if (isClosing || !clobTokenId) {
      return;
    }

    // Function to establish WebSocket connection
    const connectWebSocket = () => {
      // Clear existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Reset state
      setStatus("connecting");
      setError(null);
      reconnectAttemptRef.current += 1;
      
      // Use the full path to the v1 functions endpoint
      const wsUrl = `wss://lfmkoismabbhujycnqpn.supabase.co/functions/v1/polymarket-ws?assetId=${clobTokenId}&apikey=${SUPABASE_ANON_KEY}`;
      setRawData(prev => [...prev, `Connecting to WebSocket (attempt #${reconnectAttemptRef.current}): ${wsUrl}`]);
      
      try {
        // Create WebSocket with explicit options
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        // Set a connection timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = window.setTimeout(() => {
          if (status === "connecting" && ws.readyState !== WebSocket.OPEN) {
            setRawData(prev => [...prev, `Connection timeout after 15 seconds`]);
            setError("Connection timeout - please retry");
            ws.close();
          }
        }, 15000);
        
        // Connection opened
        ws.onopen = () => {
          if (mountedRef.current) {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            
            setStatus("connected");
            setError(null);
            setRawData(prev => [...prev, `✅ WebSocket connected successfully`]);
            
            // Send a simple message to test the connection
            try {
              const pingData = JSON.stringify({ 
                type: "ping",
                assetId: clobTokenId,
                timestamp: new Date().toISOString()
              });
              ws.send(pingData);
              setRawData(prev => [...prev, `SENT: ${pingData}`]);
            } catch (err) {
              setRawData(prev => [...prev, `❌ Error sending message: ${(err as Error).message}`]);
            }
          }
        };

        // Handle messages
        ws.onmessage = (event) => {
          if (mountedRef.current) {
            setRawData(prev => {
              const newData = [...prev, `RECEIVED: ${event.data}`];
              return newData.length > 50 ? newData.slice(-50) : newData;
            });
          }
        };

        // Handle errors
        ws.onerror = (event) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          if (mountedRef.current) {
            setStatus("error");
            setError("WebSocket error occurred");
            setRawData(prev => [...prev, `❌ WebSocket error occurred`]);
            console.error('WebSocket error:', event);
          }
        };

        // Handle close
        ws.onclose = (event) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          if (mountedRef.current) {
            setStatus("disconnected");
            setRawData(prev => [...prev, `WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`]);
          }
        };
      } catch (err) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        setError(`Failed to create WebSocket: ${(err as Error).message}`);
        setStatus("error");
        setRawData(prev => [...prev, `❌ Error creating WebSocket: ${(err as Error).message}`]);
      }
    };
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clobTokenId, isClosing, status]);

  // Render loading state
  if (status === "connecting" && rawData.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Connecting to Polymarket...</span>
      </div>
    );
  }

  // Render data display (both error and success states)
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
          
          {(status === "error" || status === "disconnected") && (
            <button 
              onClick={() => {
                if (clobTokenId) {
                  setStatus("connecting");
                  setError(null);
                  reconnectAttemptRef.current = 0;
                  
                  // Close any existing connection
                  if (wsRef.current) {
                    wsRef.current.close();
                    wsRef.current = null;
                  }
                  
                  // Add a timestamp to force a new connection attempt
                  setRawData(prev => [...prev, `Manual reconnect at: ${new Date().toISOString()}`]);
                }
              }}
              className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs ml-2"
            >
              Reconnect
            </button>
          )}
        </div>
        
        <div className="space-y-1 whitespace-pre-wrap break-all">
          {rawData.length === 0 ? (
            <div className="text-muted-foreground">Waiting for data...</div>
          ) : (
            rawData.map((data, index) => (
              <div key={index} className="border-b border-border/30 pb-1 mb-1 text-[11px]">
                {data}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
