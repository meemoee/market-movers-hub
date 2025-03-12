import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const initialConnectRef = useRef<boolean>(false);
  const reconnectCountRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    mountedRef.current = true;
    console.log('[LiveOrderBook] Component mounted');
    
    return () => {
      console.log('[LiveOrderBook] Component unmounting');
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isClosing) {
      console.log('[LiveOrderBook] Dialog is closing, cleaning up');
      setError(null);
      return;
    }

    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided, not connecting');
      return;
    }

    console.log(`[LiveOrderBook] Initiating connection for token ID: ${clobTokenId}`);
    
    cleanupExistingConnection();

    connectToOrderbook(clobTokenId);

    return () => {
      console.log('[LiveOrderBook] Effect cleanup triggered');
      cleanupExistingConnection();
      mountedRef.current = false;
    };
  }, [clobTokenId, isClosing]);

  const cleanupExistingConnection = () => {
    console.log('[LiveOrderBook] Cleaning up existing connection');
    
    if (pingIntervalRef.current) {
      console.log('[LiveOrderBook] Clearing ping interval');
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      console.log('[LiveOrderBook] Clearing reconnect timeout');
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      console.log('[LiveOrderBook] Closing existing WebSocket connection');
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

  const connectToOrderbook = (tokenId: string) => {
    try {
      console.log('[LiveOrderBook] Starting new connection for token:', tokenId);
      setConnectionStatus("connecting");
      
      if (mountedRef.current) {
        setError(null);
      }

      const wsUrl = `wss://lfmkoismabbhujycnqpn.supabase.co/functions/v1/polymarket-ws?assetId=${tokenId}`;
      console.log('[LiveOrderBook] Connecting to WebSocket:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      initialConnectRef.current = true;

      ws.onopen = () => {
        if (mountedRef.current) {
          console.log('[LiveOrderBook] WebSocket connected successfully');
          setConnectionStatus("connected");
          setError(null);
          
          reconnectCountRef.current = 0;
          startPingInterval();
        }
      };

      ws.onmessage = (event) => {
        if (mountedRef.current) {
          try {
            console.log('[LiveOrderBook] Received WebSocket message:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.ping) {
              ws.send(JSON.stringify({ pong: new Date().toISOString() }));
              return;
            }
            
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
        console.error('[LiveOrderBook] WebSocket error:', event);
        if (mountedRef.current && !isClosing) {
          setConnectionStatus("error");
          setError('WebSocket connection error');
        }
      };

      ws.onclose = (event) => {
        console.log('[LiveOrderBook] WebSocket closed with code:', event.code, 'reason:', event.reason);
        
        if (mountedRef.current && !isClosing) {
          setConnectionStatus("disconnected");
          
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
        setError('Failed to connect to orderbook service');
        
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
        wsRef.current.send(JSON.stringify({ ping: new Date().toISOString() }));
      } else {
        console.log('[LiveOrderBook] WebSocket not open during ping, clearing interval');
        clearInterval(pingIntervalRef.current!);
        pingIntervalRef.current = null;
      }
    }, 20000);
  };

  if (isLoading && !isClosing) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">
          {connectionStatus === "connecting" ? "Connecting to orderbook..." : 
           connectionStatus === "reconnecting" ? `Reconnecting to orderbook (attempt ${reconnectCountRef.current})...` :
           "Loading orderbook..."}
        </span>
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
    );
  }

  return null;
}
