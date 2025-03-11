
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
    // Direct connection to supabase edge function
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

    // Create WebSocket URL
    const wsUrl = getWebSocketUrl(clobTokenId);
    console.log("[RawOrderBookData] Initiating WebSocket connection for token:", clobTokenId);
    console.log("[RawOrderBookData] WebSocket URL:", wsUrl);
    
    // Add debug log to see if function is registered
    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-ws?assetId=${clobTokenId}`;
    console.log("[RawOrderBookData] Testing endpoint via HTTP:", functionUrl);
    
    // Test endpoint via HTTP first
    fetch(functionUrl)
      .then(response => {
        console.log("[RawOrderBookData] Endpoint test status:", response.status);
        return response.text();
      })
      .then(text => {
        console.log("[RawOrderBookData] Endpoint response:", text);
        setRawData(prev => [...prev, `HTTP test response: ${text}`]);
        
        try {
          const data = JSON.parse(text);
          setRawData(prev => [...prev, `Parsed HTTP response: ${JSON.stringify(data, null, 2)}`]);
        } catch (e) {
          setRawData(prev => [...prev, `Failed to parse HTTP response as JSON: ${e.message}`]);
        }
        
        // Now try WebSocket connection
        connectWebSocket(wsUrl);
      })
      .catch(err => {
        console.error("[RawOrderBookData] HTTP test failed:", err);
        setError(`HTTP test failed: ${err.message}`);
        setRawData(prev => [...prev, `HTTP test error: ${err.message}`]);
        
        // Try WebSocket anyway
        connectWebSocket(wsUrl);
      });

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
      console.log("[RawOrderBookData] Creating WebSocket connection to:", wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set timeout
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
        }

        // Setup ping interval
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const pingData = JSON.stringify({ ping: new Date().toISOString() });
            console.log("[RawOrderBookData] Sending ping:", pingData);
            ws.send(pingData);
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
      setError(`Failed to create WebSocket: ${err.message}`);
      setStatus("error");
      setRawData(prev => [...prev, `❌ Error creating WebSocket: ${err.message}`]);
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
      <div className="text-center p-4">
        <div className="mb-2 font-semibold text-red-500">{error}</div>
        <div className="max-h-[200px] overflow-y-auto bg-background/50 border border-border rounded-md p-2 mb-4 text-xs font-mono">
          {rawData.map((data, index) => (
            <div key={index} className="border-b border-border/30 pb-1 mb-1">
              {data}
            </div>
          ))}
        </div>
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
        <div className="sticky top-0 bg-background/90 mb-2 py-1 border-b border-border">
          Status: <span className={
            status === "connected" ? "text-green-500" :
            status === "connecting" ? "text-yellow-500" :
            status === "error" ? "text-red-500" :
            "text-muted-foreground"
          }>{status}</span>
          {error && <span className="text-red-500 ml-2">Error: {error}</span>}
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
