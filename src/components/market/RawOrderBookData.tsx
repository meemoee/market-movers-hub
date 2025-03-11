
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

  // Get the correct WebSocket URL
  const getWebSocketUrl = (tokenId: string) => {
    // Use the Edge Function URL with the correct format
    return `wss://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws?assetId=${tokenId}`;
  };

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
      console.log("[RawOrderBookData] Not connecting: closing=", isClosing, "tokenId=", clobTokenId);
      return;
    }

    // Clear existing connection
    if (wsRef.current) {
      console.log("[RawOrderBookData] Closing existing connection");
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset state
    setStatus("connecting");
    setError(null);
    setRawData([]);

    // Log the WebSocket connection attempt
    console.log("[RawOrderBookData] Initializing WebSocket connection");
    
    // Try WebSocket connection directly
    const wsUrl = getWebSocketUrl(clobTokenId);
    console.log("[RawOrderBookData] WebSocket URL:", wsUrl);
    
    try {
      // Create WebSocket with the correct URL format
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      console.log("[RawOrderBookData] WebSocket created");
      
      // Log all raw data
      setRawData(prev => [...prev, `Attempting to connect to: ${wsUrl}`]);

      // Set timeout for connection
      const timeout = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.error("[RawOrderBookData] Connection timeout");
          setError("Connection timeout after 10 seconds");
          setStatus("error");
          setRawData(prev => [...prev, "WebSocket connection timeout after 10 seconds"]);
          ws.close();
        }
      }, 10000);

      // Connection opened
      ws.onopen = () => {
        console.log("[RawOrderBookData] WebSocket connected successfully!");
        clearTimeout(timeout);
        
        if (mountedRef.current) {
          setStatus("connected");
          setError(null);
          setRawData(prev => [...prev, "✅ WebSocket connected successfully"]);
          
          // Send ping
          const pingData = JSON.stringify({ ping: new Date().toISOString() });
          console.log("[RawOrderBookData] Sending ping:", pingData);
          ws.send(pingData);
          setRawData(prev => [...prev, `SENT: ${pingData}`]);
        }
      };

      // Handle messages
      ws.onmessage = (event) => {
        console.log("[RawOrderBookData] Message received:", event.data);
        
        if (mountedRef.current) {
          // Always add raw data to log
          setRawData(prev => {
            const newData = [...prev, `RECEIVED: ${event.data}`];
            return newData.length > 100 ? newData.slice(-100) : newData;
          });
          
          try {
            // Try to parse
            const data = JSON.parse(event.data);
            console.log("[RawOrderBookData] Parsed message:", data);
            
            // Handle status updates
            if (data.type === "status") {
              setStatus(data.status || "unknown");
            }
            
            // Handle errors
            if (data.type === "error") {
              setError(data.message || "Unknown error");
            }
          } catch (err) {
            console.log("[RawOrderBookData] Couldn't parse message as JSON:", err);
            setRawData(prev => [...prev, `Parse error: ${(err as Error).message}`]);
          }
        }
      };

      // Handle errors
      ws.onerror = (event) => {
        console.error("[RawOrderBookData] WebSocket error:", event);
        clearTimeout(timeout);
        
        if (mountedRef.current) {
          setStatus("error");
          setError("WebSocket error occurred");
          setRawData(prev => [...prev, "❌ WebSocket error occurred"]);
        }
      };

      // Handle close
      ws.onclose = (event) => {
        console.log("[RawOrderBookData] WebSocket closed:", event.code, event.reason);
        clearTimeout(timeout);
        
        if (mountedRef.current) {
          setStatus("disconnected");
          setRawData(prev => [...prev, `WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`]);
        }
      };
    } catch (err) {
      console.error("[RawOrderBookData] Error creating WebSocket:", err);
      setError(`Failed to create WebSocket: ${(err as Error).message}`);
      setStatus("error");
      setRawData(prev => [...prev, `❌ Error creating WebSocket: ${(err as Error).message}`]);
    }
    
    // Cleanup
    return () => {
      if (wsRef.current) {
        console.log("[RawOrderBookData] Cleanup - closing WebSocket");
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clobTokenId, isClosing]);

  // Render loading state
  if (status === "connecting") {
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
                  setRawData([]);
                  
                  try {
                    const wsUrl = getWebSocketUrl(clobTokenId);
                    const ws = new WebSocket(wsUrl);
                    wsRef.current = ws;
                    console.log("[RawOrderBookData] WebSocket created");
                    setRawData(prev => [...prev, `Attempting to connect to: ${wsUrl}`]);
                    
                    // Setup handlers same as above
                    ws.onopen = () => {
                      console.log("[RawOrderBookData] WebSocket connected successfully!");
                      setStatus("connected");
                      setError(null);
                      setRawData(prev => [...prev, "✅ WebSocket connected successfully"]);
                    };
                    
                    ws.onmessage = (event) => {
                      console.log("[RawOrderBookData] Message received:", event.data);
                      setRawData(prev => {
                        const newData = [...prev, `RECEIVED: ${event.data}`];
                        return newData.length > 100 ? newData.slice(-100) : newData;
                      });
                    };
                    
                    ws.onerror = (event) => {
                      console.error("[RawOrderBookData] WebSocket error:", event);
                      setStatus("error");
                      setError("WebSocket error occurred");
                      setRawData(prev => [...prev, "❌ WebSocket error occurred"]);
                    };
                    
                    ws.onclose = (event) => {
                      console.log("[RawOrderBookData] WebSocket closed:", event.code, event.reason);
                      setStatus("disconnected");
                      setRawData(prev => [...prev, `WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`]);
                    };
                  } catch (err) {
                    console.error("[RawOrderBookData] Error creating WebSocket:", err);
                    setError(`Failed to create WebSocket: ${(err as Error).message}`);
                    setStatus("error");
                    setRawData(prev => [...prev, `❌ Error creating WebSocket: ${(err as Error).message}`]);
                  }
                }
              }}
              className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-sm ml-2"
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
              <div key={index} className="border-b border-border/30 pb-1 mb-1">
                {data}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
