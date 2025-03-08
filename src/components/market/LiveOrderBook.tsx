
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase, SUPABASE_PUBLIC_URL, SUPABASE_PUBLIC_KEY } from "@/integrations/supabase/client";

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
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isClosing && clobTokenId) {
      runDiagnosticTest('basic');
    }
  }, [clobTokenId, isClosing]);

  useEffect(() => {
    if (isClosing) {
      console.log('[LiveOrderBook] Dialog is closing, clearing error state');
      setError(null);
      setDiagnosticInfo(null);
      setDiagnosticDetails(null);
      return;
    }

    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided, not connecting to WebSocket');
      return;
    }

    cleanupExistingConnection();

    const connectDelay = setTimeout(() => {
      connectToOrderbook(clobTokenId);
    }, 1000);

    return () => {
      clearTimeout(connectDelay);
      cleanupExistingConnection();
      
      mountedRef.current = false;
    };
  }, [clobTokenId, isClosing]);

  const runDiagnosticTest = async (testType = 'basic') => {
    try {
      setDiagnosticInfo(`Running ${testType} diagnostic test...`);
      setDiagnosticDetails(null);
      console.log(`[LiveOrderBook] Running ${testType} diagnostic test on edge function`);
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      headers['apikey'] = SUPABASE_PUBLIC_KEY;
      
      let url = `${SUPABASE_PUBLIC_URL}/functions/v1/polymarket-ws?test=true&type=${testType}`;
      
      if (testType === 'polymarket' && clobTokenId) {
        url += `&assetId=${clobTokenId}`;
      }
      
      console.log('[LiveOrderBook] Diagnostic request URL:', url);
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LiveOrderBook] ${testType} diagnostic test failed:`, response.status, errorText);
        setDiagnosticInfo(`${testType} diagnostic failed: HTTP ${response.status}. Edge function might not be deployed properly.`);
        setDiagnosticDetails(`Error details: ${errorText}`);
        return false;
      }
      
      const data = await response.json();
      console.log(`[LiveOrderBook] ${testType} diagnostic test response:`, data);
      
      if (testType === 'basic') {
        setDiagnosticInfo(`Basic diagnostic success: Edge function is running. Timestamp: ${data.timestamp}`);
      } else if (testType === 'ws-capability') {
        setDiagnosticInfo(`WebSocket capability test: ${data.wsCapable ? 'Supported' : 'Not supported'}`);
      } else if (testType === 'polymarket') {
        setDiagnosticInfo(`Polymarket API test: ${data.status === 'ok' ? 'Success' : 'Failed'}`);
        if (data.sample_data) {
          const sampleDataStr = JSON.stringify(data.sample_data, null, 2);
          setDiagnosticDetails(`Polymarket data sample: ${sampleDataStr.length > 500 ? sampleDataStr.substring(0, 500) + '...' : sampleDataStr}`);
        }
      }
      
      setDiagnosticDetails(`Response: ${JSON.stringify(data, null, 2)}`);
      return data.status === 'ok';
    } catch (err) {
      console.error(`[LiveOrderBook] Error running ${testType} diagnostic test:`, err);
      setDiagnosticInfo(`${testType} diagnostic error: ${err.message}. Edge function might not be accessible.`);
      setDiagnosticDetails(`Full error: ${err.toString()}`);
      return false;
    }
  };

  const cleanupExistingConnection = () => {
    console.log('[LiveOrderBook] Cleaning up existing connections');
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (mountedRef.current) {
      setConnectionStatus("disconnected");
    }
  };

  const connectToOrderbook = async (tokenId: string) => {
    try {
      console.log('[LiveOrderBook] Initiating WebSocket connection for token:', tokenId);
      setConnectionStatus("connecting");
      
      if (mountedRef.current) {
        setError(null);
      }

      // First run a polymarket API test to check if the asset ID is valid
      const polymarketTestSuccess = await runDiagnosticTest('polymarket');
      
      if (!polymarketTestSuccess) {
        console.error('[LiveOrderBook] Polymarket API test failed, not proceeding with WebSocket connection');
        if (mountedRef.current) {
          setError('Cannot connect to Polymarket API for this asset. Please check the asset ID.');
          setConnectionStatus("error");
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      const wsUrl = `${SUPABASE_PUBLIC_URL.replace('https://', 'wss://')}/functions/v1/polymarket-ws?assetId=${tokenId}`;
      
      const authParams = session?.access_token ? `&token=${session.access_token}` : '';
      
      const apiKey = SUPABASE_PUBLIC_KEY;
      const fullWsUrl = `${wsUrl}${authParams}&apikey=${apiKey}`;
      
      console.log('[LiveOrderBook] Connecting to WebSocket URL (auth params hidden):', wsUrl);
      
      const ws = new WebSocket(fullWsUrl);
      wsRef.current = ws;
      initialConnectRef.current = true;

      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[LiveOrderBook] Connection timeout reached');
          wsRef.current.close();
          if (mountedRef.current) {
            setError('Connection timeout reached. Please check browser console for details.');
            setConnectionStatus("error");
          }
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        if (mountedRef.current) {
          console.log('[LiveOrderBook] WebSocket connected successfully');
          setConnectionStatus("connected");
          setError(null);
          
          reconnectCountRef.current = 0;
          
          try {
            ws.send(JSON.stringify({ ping: "initial", timestamp: new Date().toISOString() }));
            console.log('[LiveOrderBook] Sent initial ping');
          } catch (err) {
            console.error('[LiveOrderBook] Error sending initial ping:', err);
          }
          
          toast({
            title: "Orderbook Connected",
            description: "Live orderbook data is now streaming",
            duration: 3000,
          });
          
          startPingInterval();
        }
      };

      ws.onmessage = (event) => {
        if (mountedRef.current) {
          try {
            console.log('[LiveOrderBook] Received WebSocket message:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.status === "connected") {
              console.log('[LiveOrderBook] Connection confirmed by server');
              if (data.orderbook) {
                console.log('[LiveOrderBook] Initial orderbook data received');
                onOrderBookData(data.orderbook);
              }
              return;
            }
            
            if (data.pong) {
              console.log('[LiveOrderBook] Received pong response');
              return;
            }
            
            if (data.orderbook) {
              console.log('[LiveOrderBook] Orderbook data received');
              onOrderBookData(data.orderbook);
              setError(null);
              return;
            }
            
            if (data.status === "error") {
              setError(data.message || "Error in orderbook connection");
              return;
            }
            
            console.warn('[LiveOrderBook] Received unknown message format:', data);
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
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('[LiveOrderBook] WebSocket closed with code:', event.code, 'reason:', event.reason || "No reason provided");
        
        if (mountedRef.current && !isClosing) {
          setConnectionStatus("disconnected");
          
          if (event.code === 1006) {
            console.log('[LiveOrderBook] Abnormal closure detected (code 1006) - this typically indicates network issues or edge function problems');
            setError('Connection closed abnormally (code 1006). This may indicate edge function issues or network problems.');
          }
          
          if (reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.log('[LiveOrderBook] Maximum reconnection attempts reached');
            setError(`Failed to connect to orderbook service after ${MAX_RECONNECT_ATTEMPTS} attempts`);
            return;
          }
          
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
    
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('[LiveOrderBook] Sending ping to keep connection alive');
        try {
          wsRef.current.send(JSON.stringify({ ping: new Date().toISOString() }));
        } catch (err) {
          console.error('[LiveOrderBook] Error sending ping:', err);
          if (wsRef.current) {
            wsRef.current.close();
          }
        }
      } else {
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
            onClick={() => runDiagnosticTest('basic')}
            className="px-3 py-1 bg-accent/30 hover:bg-accent/50 rounded-md text-xs text-foreground"
          >
            Basic Test
          </button>
          <button 
            onClick={() => runDiagnosticTest('ws-capability')}
            className="px-3 py-1 bg-accent/30 hover:bg-accent/50 rounded-md text-xs text-foreground"
          >
            WebSocket Test
          </button>
          <button 
            onClick={() => runDiagnosticTest('polymarket')}
            className="px-3 py-1 bg-accent/30 hover:bg-accent/50 rounded-md text-xs text-foreground"
          >
            Polymarket Test
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
            onClick={() => runDiagnosticTest('polymarket')}
            className="px-3 py-1 bg-accent/30 hover:bg-accent/50 rounded-md text-sm text-foreground"
          >
            Test Polymarket API
          </button>
          <button 
            onClick={() => runDiagnosticTest('ws-capability')}
            className="px-3 py-1 bg-accent/30 hover:bg-accent/50 rounded-md text-sm text-foreground"
          >
            Test WebSocket
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
