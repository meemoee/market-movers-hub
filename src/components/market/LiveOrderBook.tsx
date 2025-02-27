
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    // Clear any existing error when closing
    if (isClosing) {
      console.log('[LiveOrderBook] Dialog is closing, clearing error state');
      setError(null);
      return;
    }

    // Don't connect if we don't have a token ID
    if (!clobTokenId) {
      console.log('[LiveOrderBook] No CLOB token ID provided, not connecting to WebSocket');
      return;
    }

    let isCleanupInitiated = false;

    const connectWebSocket = async () => {
      try {
        // Clean up any existing connection first
        if (wsRef.current) {
          console.log('[LiveOrderBook] Closing existing WebSocket connection before creating a new one');
          wsRef.current.close();
          wsRef.current = null;
        }

        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          console.log('[LiveOrderBook] Clearing existing reconnect timeout');
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Check if we've exceeded max reconnect attempts
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[LiveOrderBook] Maximum reconnection attempts reached. Giving up.');
          setError('Failed to connect after multiple attempts. Please try again later.');
          return;
        }

        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/functions/v1/polymarket-ws?assetId=${clobTokenId}`;
        console.log('[LiveOrderBook] Connecting to WebSocket:', wsUrl);
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isCleanupInitiated) {
            console.log('[LiveOrderBook] WebSocket connected successfully');
            reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
            setError(null);
          }
        };

        ws.onmessage = (event) => {
          if (!isCleanupInitiated) {
            try {
              console.log('[LiveOrderBook] Received WebSocket message:', event.data);
              const data = JSON.parse(event.data);
              
              if (data.orderbook) {
                console.log('[LiveOrderBook] Valid orderbook data received:', data.orderbook);
                onOrderBookData(data.orderbook);
                setError(null);
              } else {
                console.warn('[LiveOrderBook] Received message without orderbook data:', data);
              }
            } catch (err) {
              console.error('[LiveOrderBook] Error parsing WebSocket message:', err, 'Raw data:', event.data);
              if (!isCleanupInitiated) {
                setError('Failed to parse orderbook data');
              }
            }
          }
        };

        ws.onerror = (event) => {
          console.error('[LiveOrderBook] WebSocket error:', event);
          if (!isCleanupInitiated) {
            setError('WebSocket connection error');
            
            // Try to reconnect on error
            if (!reconnectTimeoutRef.current && !isCleanupInitiated) {
              reconnectAttemptsRef.current += 1;
              console.log(`[LiveOrderBook] Scheduling reconnect attempt ${reconnectAttemptsRef.current} after error`);
              reconnectTimeoutRef.current = setTimeout(() => {
                if (!isCleanupInitiated) {
                  console.log(`[LiveOrderBook] Attempting to reconnect after error (attempt ${reconnectAttemptsRef.current})`);
                  connectWebSocket();
                }
              }, 3000);
            }
          }
        };

        ws.onclose = (event) => {
          console.log('[LiveOrderBook] WebSocket closed with code:', event.code, 'reason:', event.reason);
          
          // Try to reconnect on unexpected close if not during cleanup
          if (!isCleanupInitiated && !reconnectTimeoutRef.current) {
            reconnectAttemptsRef.current += 1;
            console.log(`[LiveOrderBook] Scheduling reconnect attempt ${reconnectAttemptsRef.current} after close`);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!isCleanupInitiated) {
                console.log(`[LiveOrderBook] Attempting to reconnect after close (attempt ${reconnectAttemptsRef.current})`);
                connectWebSocket();
              }
            }, 3000);
          }
        };

      } catch (err) {
        console.error('[LiveOrderBook] Error setting up WebSocket:', err);
        if (!isCleanupInitiated) {
          setError('Failed to connect to orderbook service');
          
          // Try to reconnect after error in setup
          if (!reconnectTimeoutRef.current) {
            reconnectAttemptsRef.current += 1;
            console.log(`[LiveOrderBook] Scheduling reconnect attempt ${reconnectAttemptsRef.current} after setup error`);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!isCleanupInitiated) {
                console.log(`[LiveOrderBook] Attempting to reconnect after setup error (attempt ${reconnectAttemptsRef.current})`);
                connectWebSocket();
              }
            }, 3000);
          }
        }
      }
    };

    console.log('[LiveOrderBook] Initiating WebSocket connection for token:', clobTokenId);
    connectWebSocket();

    // Cleanup function
    return () => {
      isCleanupInitiated = true;
      console.log('[LiveOrderBook] Cleanup initiated, closing WebSocket connection');
      
      setError(null);
      
      if (reconnectTimeoutRef.current) {
        console.log('[LiveOrderBook] Clearing reconnect timeout during cleanup');
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (wsRef.current) {
        console.log('[LiveOrderBook] Closing WebSocket during cleanup');
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clobTokenId, onOrderBookData, isClosing]);

  if (isLoading && !isClosing) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Connecting to orderbook...</span>
      </div>
    );
  }

  if (error && !isClosing) {
    return (
      <div className="text-center py-4">
        <div className="text-red-500 mb-2">{error}</div>
        <div className="text-sm text-gray-400">
          Unable to connect to the orderbook service. This could be due to network issues or the service may be temporarily unavailable.
        </div>
      </div>
    );
  }

  return null;
}
