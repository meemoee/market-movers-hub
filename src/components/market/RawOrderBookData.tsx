
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
}

export function RawOrderBookData({ clobTokenId, isClosing }: RawOrderBookProps) {
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef<boolean>(true);
  
  // Basic HTTP test to check Edge Function availability
  useEffect(() => {
    const testEndpoint = async () => {
      try {
        const response = await fetch(`https://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws?test=true`);
        setRawData(prev => [...prev, `HTTP test status: ${response.status}`]);
        
        // Only attempt WebSocket if the endpoint is available
        if (response.ok) {
          setRawData(prev => [...prev, `✅ Edge Function is accessible`]);
        } else {
          setRawData(prev => [...prev, `❌ Edge Function returned error: ${response.status}`]);
          setError(`Edge Function error: ${response.status}`);
        }
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
    };
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    // Skip if closing or no tokenId
    if (isClosing || !clobTokenId) {
      return;
    }

    // Clear existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset state
    setStatus("connecting");
    setError(null);
    
    // Get WebSocket URL
    const wsUrl = `wss://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws?assetId=${clobTokenId}`;
    setRawData(prev => [...prev, `Attempting to connect to: ${wsUrl}`]);
    
    try {
      // Create WebSocket
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      // Connection opened
      ws.onopen = () => {
        if (mountedRef.current) {
          setStatus("connected");
          setError(null);
          setRawData(prev => [...prev, `✅ WebSocket connected successfully`]);
          
          // Send a ping message immediately after connection
          try {
            const pingData = JSON.stringify({ ping: Date.now() });
            ws.send(pingData);
            setRawData(prev => [...prev, `SENT: ${pingData}`]);
          } catch (err) {
            setRawData(prev => [...prev, `❌ Error sending ping: ${(err as Error).message}`]);
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
      ws.onerror = () => {
        if (mountedRef.current) {
          setStatus("error");
          setError("WebSocket error occurred");
          setRawData(prev => [...prev, `❌ WebSocket error occurred`]);
        }
      };

      // Handle close
      ws.onclose = (event) => {
        if (mountedRef.current) {
          setStatus("disconnected");
          setRawData(prev => [...prev, `WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`]);
        }
      };
    } catch (err) {
      setError(`Failed to create WebSocket: ${(err as Error).message}`);
      setStatus("error");
      setRawData(prev => [...prev, `❌ Error creating WebSocket: ${(err as Error).message}`]);
    }
    
    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clobTokenId, isClosing]);

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
          
          {status === "error" && (
            <button 
              onClick={() => {
                if (clobTokenId) {
                  setStatus("connecting");
                  setError(null);
                  
                  // Simple retry - just reset the connection
                  if (wsRef.current) {
                    wsRef.current.close();
                    wsRef.current = null;
                  }
                  
                  // Add a timestamp to force a new connection attempt
                  setRawData(prev => [...prev, `Retry attempt at: ${new Date().toISOString()}`]);
                }
              }}
              className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs ml-2"
            >
              Retry
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
