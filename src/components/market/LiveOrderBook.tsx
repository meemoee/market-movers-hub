import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

interface LiveOrderBookProps {
  onOrderBookData: (data: OrderBookData | null) => void;
  isLoading: boolean;
  clobTokenId?: string;
  isClosing?: boolean;
}

export function LiveOrderBook({ onOrderBookData, isLoading, clobTokenId, isClosing }: LiveOrderBookProps) {
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [diagnosticInfo, setDiagnosticInfo] = useState<string | null>(null);
  const [diagnosticDetails, setDiagnosticDetails] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const initialConnectRef = useRef<boolean>(false);
  const reconnectCountRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    // Set mounted flag to true when component mounts
    mountedRef.current = true;
    
    return () => {
      // Set mounted flag to false when component unmounts
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Run a diagnostic test on the edge function
    if (!isClosing && clobTokenId) {
      runDiagnosticTest();
    }
  }, [clobTokenId, isClosing]);

  useEffect(() => {
    // Clear any existing error when closing
    if (isClosing) {
      console.log('[LiveOrderBook] Dialog is closing, clearing error state');
      setError(null);
      setDiagnosticInfo(null);
      setDiagnosticDetails(null);
      return;
    }

    // Don't connect if we don't have a token ID
    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided, not connecting to WebSocket');
      return;
    }

    // Clean up any existing connection first
    cleanupExistingConnection();

    // Wait for diagnostic test to complete before trying WebSocket connection
    // Just a short delay to make sure our function is ready
    const connectDelay = setTimeout(() => {
      // Create a new WebSocket connection
      connectToOrderbook(clobTokenId);
    }, 1000);

    // Cleanup function
    return () => {
      clearTimeout(connectDelay);
      cleanupExistingConnection();
      
      // Set mounted ref to false to prevent any further state updates
      mountedRef.current = false;
    };
  }, [clobTokenId, isClosing]);

  const runDiagnosticTest = async () => {
    try {
      setDiagnosticInfo("Running diagnostic test...");
      setDiagnosticDetails(null);
      console.log('[LiveOrderBook] Running diagnostic test on edge function');
      
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add authentication headers if we have a session
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      // Include Supabase anon key
      headers['apikey'] = supabase.supabaseKey;
      
      // Log the request details for debugging
      console.log('[LiveOrderBook] Diagnostic request headers:', JSON.stringify(headers, null, 2));
      
      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/polymarket-ws?test=true`, 
        { headers }
      );
      
      // Log the response status and headers for debugging
      console.log('[LiveOrderBook] Diagnostic response status:', response.status);
      console.log('[LiveOrderBook] Diagnostic response headers:', 
        JSON.stringify(Object.fromEntries([...response.headers.entries()]), null, 2)
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LiveOrderBook] Diagnostic test failed:', response.status, errorText);
        setDiagnosticInfo(`Diagnostic failed: HTTP ${response.status}. Edge function might not be deployed properly.`);
        setDiagnosticDetails(`Error details: ${errorText}`);
        return;
      }
      
      const data = await response.json();
      console.log('[LiveOrderBook] Diagnostic test response:', data);
      setDiagnosticInfo(`Diagnostic success: Edge function is running. Timestamp: ${data.timestamp}`);
      setDiagnosticDetails(`Response: ${JSON.stringify(data, null, 2)}`);
    } catch (err) {
      console.error('[LiveOrderBook] Error running diagnostic test:', err);
      setDiagnosticInfo(`Diagnostic error: ${err.message}. Edge function might not be accessible.`);
      setDiagnosticDetails(`Full error: ${err.toString()}`);
    }
  };

  const cleanupExistingConnection = () => {
    console.log('[LiveOrderBook] Cleaning up existing connections');
    
    // Clear ping interval if it exists
    if (pingIntervalRef.current) {
      console.log('[LiveOrderBook] Clearing ping interval');
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      console.log('[LiveOrderBook] Clearing existing reconnect timeout');
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close any existing WebSocket connection
    if (wsRef.current) {
      console.log('[LiveOrderBook] Closing existing WebSocket connection');
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Reset connection status
    if (mountedRef.current) {
      setConnectionStatus("disconnected");
    }
  };

  const connectToOrderbook = async (tokenId: string) => {
    try {
      console.log('[LiveOrderBook] Initiating WebSocket connection for token:', tokenId);
      setConnectionStatus("connecting");
      
      // Reset error state
      if (mountedRef.current) {
        setError(null);
      }

      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      let wsUrl = `${supabase.supabaseUrl.replace('https://', 'wss://')}/functions/v1/polymarket-ws?assetId=${tokenId}`;
      
      // Add authentication token as a query parameter if available
      if (session?.access_token) {
        wsUrl += `&token=${session.access_token}`;
      }
      // Always include the anon key
      wsUrl += `&apikey=${supabase.supabaseKey}`;
      
      console.log('[LiveOrderBook] Connecting to WebSocket URL (auth params hidden):', wsUrl.split('?')[0] + '?...');
      console.log('[LiveOrderBook] Browser WebSocket version:', typeof WebSocket !== 'undefined' ? 'Supported' : 'Not supported');
      
      // Log websocket request headers for debugging
      console.log('[LiveOrderBook] Connection will include these headers by default:', {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': '[Browser generates this]'
      });
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      initialConnectRef.current = true;

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[LiveOrderBook] Connection timeout reached');
          wsRef.current.close();
          if (mountedRef.current) {
            setError('Connection timeout reached. Please check browser console for details.');
            setConnectionStatus("error");
          }
        }
      }, 10000); // 10 second timeout

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        if (mountedRef.current) {
          console.log('[LiveOrderBook] WebSocket connected successfully');
          setConnectionStatus("connected");
          setError(null);
          
          // Reset reconnect counter on successful connection
          reconnectCountRef.current = 0;
          
          // Send initial ping to verify connection
          try {
            ws.send(JSON.stringify({ ping: "initial", timestamp: new Date().toISOString() }));
            console.log('[LiveOrderBook] Sent initial ping');
          } catch (err) {
            console.error('[LiveOrderBook] Error sending initial ping:', err);
          }
          
          // Notify user of successful connection
          toast({
            title: "Orderbook Connected",
            description: "Live orderbook data is now streaming",
            duration: 3000,
          });
          
          // Start ping interval to keep connection alive
          startPingInterval();
        }
      };

      ws.onmessage = (event) => {
        if (mountedRef.current) {
          try {
            console.log('[LiveOrderBook] Received WebSocket message:', event.data);
            const data = JSON.parse(event.data);
            
            // Handle connection status messages
            if (data.status === "connected") {
              console.log('[LiveOrderBook] Connection confirmed by server');
              return;
            }
            
            // Handle echo messages (diagnostic)
            if (data.status === "echo") {
              console.log('[LiveOrderBook] Received echo from server:', data);
              return;
            }
            
            // Handle ping-pong messages
            if (data.ping) {
              ws.send(JSON.stringify({ pong: new Date().toISOString() }));
              return;
            }
            
            if (data.pong) {
              console.log('[LiveOrderBook] Received pong response');
              return;
            }
            
            // Handle status messages
            if (data.status) {
              console.log('[LiveOrderBook] Received status update:', data.status);
              
              if (data.status === "error") {
                setError(data.message || "Error in orderbook connection");
                return;
              }
              
              if (data.status === "reconnecting") {
                setConnectionStatus("reconnecting");
                return;
              }
              
              if (data.status === "failed") {
                setError("Failed to connect to orderbook service after multiple attempts");
                return;
              }
              
              if (data.status === "connected") {
                setConnectionStatus("connected");
                setError(null);
                return;
              }
              
              return;
            }
            
            // Handle orderbook data
            if (data.orderbook) {
              console.log('[LiveOrderBook] Valid orderbook data received:', data.orderbook);
              onOrderBookData(data.orderbook);
              setError(null);
            } else {
              console.warn('[LiveOrderBook] Received message without orderbook data:', data);
            }
          } catch (err) {
            console.error('[LiveOrderBook] Error parsing WebSocket message:', err, 'Raw data:', event.data);
            if (mountedRef.current) {
              setError('Failed to parse orderbook data');
            }
          }
        }
      };

      ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        console.error('[LiveOrderBook] WebSocket error:', event);
        if (mountedRef.current && !isClosing) {
          setConnectionStatus("error");
          setError('WebSocket connection error. Please check browser console for details.');
          
          // Handle reconnection in onclose since that's always called after an error
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('[LiveOrderBook] WebSocket closed with code:', event.code, 'reason:', event.reason || "No reason provided");
        
        // Only attempt reconnect if mounted and not intentionally closing
        if (mountedRef.current && !isClosing) {
          setConnectionStatus("disconnected");
          
          // Special handling for code 1006 (abnormal closure)
          if (event.code === 1006) {
            console.log('[LiveOrderBook] Abnormal closure detected (code 1006) - this typically indicates network issues or edge function problems');
            setError('Connection closed abnormally (code 1006). This may indicate edge function issues or network problems.');
          }
          
          // Check if we've exceeded max reconnect attempts
          if (reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.log('[LiveOrderBook] Maximum reconnection attempts reached');
            setError(`Failed to connect to orderbook service after ${MAX_RECONNECT_ATTEMPTS} attempts`);
            return;
          }
          
          // Schedule a reconnect attempt with exponential backoff
          reconnectCountRef.current += 1;
          const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectCountRef.current - 1), 30000);
          
          console.log(`[LiveOrderBook] Scheduling reconnect attempt ${reconnectCountRef.current}/${MAX_RECONNECT_ATTEMPTS} after ${reconnectDelay}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && !isClosing) {
              console.log('[LiveOrderBook] Attempting to reconnect after close');
              connectToOrderbook(tokenId);
            }
          }, reconnectDelay);
        }
      };
    } catch (err) {
      console.error('[LiveOrderBook] Error setting up WebSocket:', err);
      if (mountedRef.current && !isClosing) {
        setConnectionStatus("error");
        setError(`Failed to connect to orderbook service: ${err.message}`);
        
        // Schedule reconnect attempt if not at max attempts
        if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectCountRef.current += 1;
          const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectCountRef.current - 1), 30000);
          
          console.log(`[LiveOrderBook] Scheduling reconnect attempt ${reconnectCountRef.current}/${MAX_RECONNECT_ATTEMPTS} after ${reconnectDelay}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && !isClosing) {
              console.log('[LiveOrderBook] Attempting to reconnect after setup error');
              connectToOrderbook(tokenId);
            }
          }, reconnectDelay);
        } else {
          console.log('[LiveOrderBook] Maximum reconnection attempts reached');
          setError(`Failed to connect to orderbook service after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        }
      }
    }
  };

  const startPingInterval = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    // Send a ping every 20 seconds to keep the connection alive
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('[LiveOrderBook] Sending ping to keep connection alive');
        try {
          wsRef.current.send(JSON.stringify({ ping: new Date().toISOString() }));
        } catch (err) {
          console.error('[LiveOrderBook] Error sending ping:', err);
          // If we can't send a ping, the connection is likely broken
          if (wsRef.current) {
            wsRef.current.close();
          }
        }
      } else {
        // Clear interval if socket is no longer open
        clearInterval(pingIntervalRef.current!);
        pingIntervalRef.current = null;
      }
    }, 20000);
  };

  if (isLoading && !isClosing) {
    return (
      <div className="flex flex-col items-center justify-center py-4 space-y-2">
        <div className="flex items-center">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2">
            {connectionStatus === "connecting" ? "Connecting to orderbook..." : 
             connectionStatus === "reconnecting" ? `Reconnecting to orderbook (attempt ${reconnectCountRef.current})...` :
             "Loading orderbook..."}
          </span>
        </div>
        
        {diagnosticInfo && (
          <div className="text-xs text-muted-foreground bg-accent/20 p-2 rounded-md max-w-full overflow-x-auto">
            {diagnosticInfo}
            {diagnosticDetails && (
              <details className="mt-1">
                <summary className="cursor-pointer">View details</summary>
                <pre className="text-xs mt-1 whitespace-pre-wrap">{diagnosticDetails}</pre>
              </details>
            )}
          </div>
        )}
        
        <div className="flex space-x-2 mt-2">
          <button 
            onClick={runDiagnosticTest}
            className="px-3 py-1 bg-accent/30 hover:bg-accent/50 rounded-md text-xs text-foreground"
          >
            Run Diagnostic
          </button>
        </div>
      </div>
    );
  }

  if (error && !isClosing) {
    return (
      <div className="text-center text-red-500 py-4">
        <div className="mb-2">{error}</div>
        {diagnosticInfo && (
          <div className="text-xs text-muted-foreground mb-2 bg-accent/20 p-2 rounded-md">
            {diagnosticInfo}
            {diagnosticDetails && (
              <details className="mt-1">
                <summary className="cursor-pointer">View details</summary>
                <pre className="text-xs mt-1 whitespace-pre-wrap">{diagnosticDetails}</pre>
              </details>
            )}
          </div>
        )}
        <div className="flex space-x-2 justify-center">
          <button 
            onClick={runDiagnosticTest}
            className="px-3 py-1 bg-accent/30 hover:bg-accent/50 rounded-md text-sm text-foreground"
          >
            Run Diagnostic
          </button>
          <button 
            onClick={() => {
              if (clobTokenId) {
                cleanupExistingConnection();
                reconnectCountRef.current = 0;
                connectToOrderbook(clobTokenId);
              }
            }}
            className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-sm"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return null;
}
