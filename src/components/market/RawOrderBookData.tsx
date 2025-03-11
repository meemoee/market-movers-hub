
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
}

export function RawOrderBookData({ clobTokenId, isClosing }: RawOrderBookProps) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [rawData, setRawData] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef<boolean>(true);
  
  // Function to determine the correct WebSocket URL
  const getWebSocketUrl = (tokenId: string) => {
    // First try with Lovable domain for preview environments
    if (window.location.hostname.includes('lovable')) {
      const host = window.location.host;
      return `wss://${host}/api/v1/polymarket-ws?assetId=${tokenId}`;
    }
    
    // Fallback to direct Supabase URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://lfmkoismabbhujycnqpn.supabase.co";
    return `${supabaseUrl.replace('https://', 'wss://')}/functions/v1/polymarket-ws?assetId=${tokenId}`;
  };

  // Track component mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Connect to WebSocket when token ID changes
  useEffect(() => {
    // Clear state when closing
    if (isClosing) {
      console.log('[RawOrderBookData] Dialog is closing, clearing state');
      setError(null);
      return;
    }

    // Don't connect if we don't have a token ID
    if (!clobTokenId) {
      console.log('[RawOrderBookData] No CLOB token ID provided');
      return;
    }

    // Clean up any existing connection first
    cleanupConnection();

    // Connect to orderbook WebSocket
    connectToOrderbook(clobTokenId);

    // Cleanup function
    return cleanupConnection;
  }, [clobTokenId, isClosing]);

  const cleanupConnection = () => {
    console.log('[RawOrderBookData] Cleaning up connection');
    
    // Close any existing WebSocket connection
    if (wsRef.current) {
      console.log('[RawOrderBookData] Closing existing WebSocket connection');
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Reset status
    if (mountedRef.current) {
      setStatus("disconnected");
    }
  };

  const connectToOrderbook = (tokenId: string) => {
    try {
      console.log('[RawOrderBookData] Initiating WebSocket connection for token:', tokenId);
      
      // Reset state
      if (mountedRef.current) {
        setStatus("connecting");
        setError(null);
        setRawData([]);
      }

      // Get WebSocket URL
      const wsUrl = getWebSocketUrl(tokenId);
      console.log('[RawOrderBookData] Connecting to WebSocket:', wsUrl);
      
      // Test endpoint availability with a regular HTTP request
      const testUrl = wsUrl.replace('wss://', 'https://');
      console.log('[RawOrderBookData] Testing endpoint:', testUrl);
      
      fetch(testUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(response => {
        console.log('[RawOrderBookData] Endpoint test response:', response);
        response.json().then(data => {
          console.log('[RawOrderBookData] Endpoint test data:', data);
        }).catch(err => {
          console.log('[RawOrderBookData] Could not parse endpoint test response');
        });
      })
      .catch(err => {
        console.error('[RawOrderBookData] Endpoint test failed:', err);
        if (mountedRef.current) {
          setError('Failed to reach orderbook service');
        }
      });
      
      // Create WebSocket connection
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set timeout for initial connection
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          console.error('[RawOrderBookData] Connection timeout');
          if (mountedRef.current) {
            setError('Connection timeout - Could not establish WebSocket connection');
            setStatus("error");
          }
          ws.close();
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[RawOrderBookData] WebSocket connected successfully');
        
        if (mountedRef.current) {
          setStatus("connected");
          setError(null);
          setRawData(prev => [...prev, "WebSocket connected"]);
          
          // Send initial ping
          ws.send(JSON.stringify({ ping: new Date().toISOString() }));
        }
        
        // Start ping interval
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: new Date().toISOString() }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (mountedRef.current) {
          try {
            console.log('[RawOrderBookData] Received WebSocket message:', event.data);
            
            // Add raw data to our log
            setRawData(prev => {
              // Limit to last 100 messages to prevent memory issues
              const newData = [...prev, event.data];
              if (newData.length > 100) {
                return newData.slice(newData.length - 100);
              }
              return newData;
            });
            
            // Try to parse the data for status updates
            const data = JSON.parse(event.data);
            
            // Handle status messages
            if (data.status) {
              console.log('[RawOrderBookData] Received status update:', data.status);
              setStatus(data.status);
              
              if (data.status === "error") {
                setError(data.message || "Error in orderbook connection");
              }
            }
            
            // Handle pong messages
            if (data.pong) {
              console.log('[RawOrderBookData] Received pong:', data.pong);
            }
            
            // Handle raw data from Polymarket
            if (data.raw_data) {
              console.log('[RawOrderBookData] Received raw Polymarket data');
            }
          } catch (err) {
            console.error('[RawOrderBookData] Error parsing WebSocket message:', err);
            setRawData(prev => [...prev, `Error parsing: ${event.data}`]);
          }
        }
      };

      ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        console.error('[RawOrderBookData] WebSocket error:', event);
        
        if (mountedRef.current && !isClosing) {
          setStatus("error");
          setError('WebSocket connection error');
          setRawData(prev => [...prev, "WebSocket error occurred"]);
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('[RawOrderBookData] WebSocket closed with code:', event.code, 'reason:', event.reason);
        
        if (mountedRef.current && !isClosing) {
          setStatus("disconnected");
          setRawData(prev => [...prev, `WebSocket closed: code=${event.code}, reason=${event.reason}`]);
        }
      };
    } catch (err) {
      console.error('[RawOrderBookData] Error setting up WebSocket:', err);
      if (mountedRef.current && !isClosing) {
        setStatus("error");
        setError(`Failed to connect: ${err.message}`);
      }
    }
  };

  if (status === "connecting") {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="ml-2">Connecting to orderbook...</span>
      </div>
    );
  }

  if (error && !isClosing) {
    return (
      <div className="text-center text-red-500 py-4">
        <div className="mb-2">{error}</div>
        <button 
          onClick={() => {
            if (clobTokenId) {
              cleanupConnection();
              connectToOrderbook(clobTokenId);
            }
          }}
          className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="h-[300px] overflow-y-auto bg-background/50 border border-border rounded-md p-2">
      <div className="text-xs font-mono">
        <div className="mb-1 text-muted-foreground">WebSocket Status: <span className={
          status === "connected" ? "text-green-500" :
          status === "connecting" ? "text-yellow-500" :
          status === "error" ? "text-red-500" :
          "text-muted-foreground"
        }>{status}</span></div>
        <div className="space-y-1">
          {rawData.length === 0 ? (
            <div className="text-muted-foreground">No data received yet...</div>
          ) : (
            rawData.map((data, index) => (
              <pre key={index} className="whitespace-pre-wrap break-all text-xs">{data}</pre>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
