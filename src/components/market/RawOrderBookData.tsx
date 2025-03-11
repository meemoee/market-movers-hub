
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
  
  // Get WebSocket URL
  const getWebSocketUrl = (tokenId: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://lfmkoismabbhujycnqpn.supabase.co";
    return `${supabaseUrl.replace('https://', 'wss://')}/functions/v1/polymarket-ws?assetId=${tokenId}`;
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

    // Log debug info
    console.log("[RawOrderBookData] Debug - Starting new WebSocket connection");
    console.log("[RawOrderBookData] - Token ID:", clobTokenId);
    console.log("[RawOrderBookData] - Closing:", isClosing);
    console.log("[RawOrderBookData] - Environment:", import.meta.env.MODE);
    console.log("[RawOrderBookData] - Supabase URL:", import.meta.env.VITE_SUPABASE_URL);

    try {
      // Create WebSocket URL
      const wsUrl = getWebSocketUrl(clobTokenId);
      console.log("[RawOrderBookData] Connecting to:", wsUrl);

      // First test if endpoint is available
      const httpUrl = wsUrl.replace('wss://', 'https://');
      console.log("[RawOrderBookData] Testing endpoint:", httpUrl);
      
      // Check endpoint with HTTP request
      fetch(httpUrl)
        .then(response => {
          console.log("[RawOrderBookData] Endpoint test status:", response.status);
          
          // Extract response body for debugging
          response.text().then(text => {
            console.log("[RawOrderBookData] Endpoint response body:", text);
            
            try {
              // Try to parse as JSON
              const data = JSON.parse(text);
              console.log("[RawOrderBookData] Parsed endpoint response:", data);
              
              // Add to log
              setRawData(prev => [...prev, `Endpoint test: ${JSON.stringify(data, null, 2)}`]);
            } catch (err) {
              console.log("[RawOrderBookData] Endpoint response is not valid JSON");
              
              // Add raw response to log
              setRawData(prev => [...prev, `Endpoint test raw response: ${text}`]);
            }
          });
          
          // Now connect via WebSocket
          connectWebSocket(wsUrl);
        })
        .catch(err => {
          console.error("[RawOrderBookData] Endpoint test failed:", err);
          setError(`Endpoint test failed: ${err.message}`);
          setRawData(prev => [...prev, `Endpoint test error: ${err.message}`]);
        });
    } catch (err) {
      console.error("[RawOrderBookData] Setup failed:", err);
      setError(`Setup error: ${err.message}`);
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

  // WebSocket connection function
  const connectWebSocket = (wsUrl: string) => {
    try {
      // Create WebSocket
      console.log("[RawOrderBookData] Creating WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set timeout
      const timeout = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.error("[RawOrderBookData] Connection timeout");
          setError("Connection timeout after 10 seconds");
          setStatus("error");
          ws.close();
        }
      }, 10000);

      // Connection opened
      ws.onopen = () => {
        console.log("[RawOrderBookData] WebSocket connected");
        clearTimeout(timeout);
        
        if (mountedRef.current) {
          setStatus("connected");
          setError(null);
          setRawData(prev => [...prev, "WebSocket connected"]);
          
          // Send ping
          ws.send(JSON.stringify({ ping: new Date().toISOString() }));
        }

        // Setup ping interval
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log("[RawOrderBookData] Sending ping");
            ws.send(JSON.stringify({ ping: new Date().toISOString() }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      };

      // Handle messages
      ws.onmessage = (event) => {
        console.log("[RawOrderBookData] Message received:", event.data);
        
        if (mountedRef.current) {
          // Always add raw data to log
          setRawData(prev => {
            const newData = [...prev, `DATA: ${event.data}`];
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
            console.log("[RawOrderBookData] Couldn't parse message as JSON");
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
          setRawData(prev => [...prev, "WebSocket error"]);
        }
      };

      // Handle close
      ws.onclose = (event) => {
        console.log("[RawOrderBookData] WebSocket closed:", event.code, event.reason);
        clearTimeout(timeout);
        
        if (mountedRef.current) {
          setStatus("disconnected");
          setRawData(prev => [...prev, `WebSocket closed: code=${event.code}, reason=${event.reason}`]);
        }
      };
    } catch (err) {
      console.error("[RawOrderBookData] Error creating WebSocket:", err);
      setError(`Failed to create WebSocket: ${err.message}`);
      setStatus("error");
    }
  };

  // Render loading state
  if (status === "connecting") {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Connecting to Polymarket...</span>
      </div>
    );
  }

  // Render error state
  if (error && !isClosing) {
    return (
      <div className="text-center text-red-500 p-4">
        <div className="mb-2 font-semibold">{error}</div>
        <button 
          onClick={() => {
            if (clobTokenId) {
              setStatus("connecting");
              setError(null);
              setRawData([]);
              
              const wsUrl = getWebSocketUrl(clobTokenId);
              connectWebSocket(wsUrl);
            }
          }}
          className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Render data display
  return (
    <div className="h-[300px] overflow-y-auto bg-background/50 border border-border rounded-md p-2">
      <div className="text-xs font-mono">
        <div className="mb-2 text-muted-foreground">
          Status: <span className={
            status === "connected" ? "text-green-500" :
            status === "connecting" ? "text-yellow-500" :
            status === "error" ? "text-red-500" :
            "text-muted-foreground"
          }>{status}</span>
        </div>
        
        <div className="space-y-1 whitespace-pre-wrap break-all">
          {rawData.length === 0 ? (
            <div className="text-muted-foreground">Waiting for data...</div>
          ) : (
            rawData.map((data, index) => (
              <div key={index} className="border-b border-border/30 pb-1">
                {data}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
