
import { useEffect, useState, useRef } from 'react';
import { Loader2, ArrowDown, ArrowUp, Tag, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useEventListener } from "@/hooks/use-event-listener";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number | null;
  best_ask: number | null;
  spread: string | null;
  timestamp: string | null;
}

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
  onOrderBookData?: (data: OrderBookData) => void;
}

export function RawOrderBookData({ clobTokenId, isClosing, onOrderBookData }: RawOrderBookProps) {
  const [status, setStatus] = useState<string>("disconnected");
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<boolean>(false);
  const [reconnectInfo, setReconnectInfo] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const manualReconnectRef = useRef<boolean>(false);
  
  // Update parent component with order book data
  useEffect(() => {
    if (orderBookData && onOrderBookData) {
      onOrderBookData(orderBookData);
    }
  }, [orderBookData, onOrderBookData]);

  // Function to fetch initial data via REST API as fallback
  const fetchInitialOrderBookData = async () => {
    if (!clobTokenId) return;
    
    try {
      setStatus("connecting");
      console.log(`Fetching initial order book data for token: ${clobTokenId}`);
      
      const { data, error } = await supabase.functions.invoke('polymarket-stream', {
        body: { tokenId: clobTokenId }
      });
      
      if (error) {
        console.error("Initial data fetch failed:", error);
        setStatus("error");
        setError(error.message);
        return;
      }
      
      if (data) {
        console.log("Received initial order book data:", {
          bid_levels: data.bids ? Object.keys(data.bids).length : 0,
          ask_levels: data.asks ? Object.keys(data.asks).length : 0,
          best_bid: data.best_bid,
          best_ask: data.best_ask
        });
        
        setStatus("connected");
        setError(null);
        setOrderBookData(data);
        setLastUpdateTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Error fetching order book data:", err);
      setStatus("error");
      setError(`Connection failed: ${(err as Error).message}`);
    }
  };

  // Connect to WebSocket
  const connectWebSocket = () => {
    if (!clobTokenId || isClosing) return;
    
    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    try {
      setStatus("connecting");
      setReconnecting(false);
      setReconnectInfo(null);
      
      // Close any existing connection
      if (wsRef.current) {
        try {
          wsRef.current.close();
          wsRef.current = null;
        } catch (err) {
          console.error("Error closing existing WebSocket:", err);
        }
      }
      
      const projectId = 'lfmkoismabbhujycnqpn';
      const wsUrl = `wss://${projectId}.functions.supabase.co/orderbook-stream?tokenId=${clobTokenId}`;
      
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connection opened to Edge Function');
        // Status will be updated when the "connected" message is received from the server
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'orderbook_update':
              setOrderBookData(message.data);
              setLastUpdateTime(new Date().toLocaleTimeString());
              setStatus("connected");
              setError(null);
              setReconnecting(false);
              setReconnectInfo(null);
              break;
              
            case 'connected':
              console.log('Connected to Polymarket through Edge Function');
              setStatus("connected");
              setError(null);
              setReconnecting(false);
              setReconnectInfo(null);
              break;
              
            case 'reconnecting':
              console.log('Reconnecting to Polymarket:', message.message);
              setStatus("reconnecting");
              setReconnecting(true);
              setReconnectInfo(message.message);
              break;
              
            case 'error':
              console.error('WebSocket error message:', message.message);
              setError(message.message);
              
              // Only change status to error if we're not reconnecting
              if (!message.message.includes('Reconnecting')) {
                setStatus("error");
              }
              break;
              
            case 'disconnected':
              setStatus("disconnected");
              setError(message.message);
              break;
              
            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
      
      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setStatus("error");
        setError('WebSocket connection error');
        
        // If this is a manual reconnect attempt and it failed, try the REST API
        if (manualReconnectRef.current) {
          manualReconnectRef.current = false;
          fetchInitialOrderBookData();
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log(`WebSocket closed: code=${event.code}, reason=${event.reason || 'No reason provided'}`);
        
        if (status !== "disconnected" && !isClosing) {
          setStatus("disconnected");
        }
        
        wsRef.current = null;
      };
    } catch (err) {
      console.error('Error establishing WebSocket connection:', err);
      setStatus("error");
      setError(`Failed to connect: ${(err as Error).message}`);
      wsRef.current = null;
      
      // If this is a manual reconnect attempt and it failed, try the REST API
      if (manualReconnectRef.current) {
        manualReconnectRef.current = false;
        fetchInitialOrderBookData();
      }
    }
  };
  
  // Initialize connection
  useEffect(() => {
    if (isClosing || !clobTokenId) return;
    
    // Try WebSocket connection first
    connectWebSocket();
    
    // Cleanup function
    return () => {
      console.log("Cleaning up order book connection");
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clobTokenId, isClosing]);
  
  // Detect window focus changes to reconnect if needed
  useEventListener('focus', () => {
    if ((status === "disconnected" || status === "error") && !isClosing && clobTokenId && !wsRef.current) {
      console.log('Window focused, attempting to reconnect WebSocket');
      connectWebSocket();
    }
  });

  // Handle manual refresh
  const handleManualRefresh = async () => {
    if (!clobTokenId) return;
    
    manualReconnectRef.current = true;
    
    // Try to reconnect via WebSocket
    connectWebSocket();
    
    // If we still don't have data after a short delay, fall back to REST API
    setTimeout(() => {
      if (status !== "connected" && manualReconnectRef.current) {
        manualReconnectRef.current = false;
        fetchInitialOrderBookData();
      }
    }, 3000);
  };

  // Format price to a readable string
  const formatPrice = (price: string | number) => {
    return Number(price).toFixed(3);
  };

  // Format size to a readable string
  const formatSize = (size: number) => {
    return size.toLocaleString(undefined, { 
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  // Render loading state
  if ((status === "connecting" || status === "reconnecting") && !orderBookData) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>{status === "reconnecting" ? "Reconnecting to order book..." : "Connecting to order book stream..."}</span>
      </div>
    );
  }
  
  // Render data display
  return (
    <div className="h-[300px] overflow-y-auto bg-background/50 border border-border rounded-md p-2">
      <div className="text-xs">
        <div className="sticky top-0 bg-background/90 mb-2 py-1 border-b border-border z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              {status === "connected" ? (
                <Wifi className="h-3 w-3 mr-1 text-green-500" />
              ) : status === "reconnecting" ? (
                <Loader2 className="h-3 w-3 mr-1 text-yellow-500 animate-spin" />
              ) : (
                <WifiOff className="h-3 w-3 mr-1 text-red-500" />
              )}
              <span className={
                status === "connected" ? "text-green-500" :
                status === "connecting" ? "text-yellow-500" :
                status === "reconnecting" ? "text-yellow-500" :
                status === "error" ? "text-red-500" :
                "text-muted-foreground"
              }>{status}</span>
              {error && !reconnecting && <span className="text-red-500 ml-2 text-[10px]">Error: {error}</span>}
              {reconnecting && reconnectInfo && (
                <span className="text-yellow-500 ml-2 text-[10px]">{reconnectInfo}</span>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground">
              {lastUpdateTime && (
                <span>Last update: {lastUpdateTime}</span>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1 mt-1">
            {(status === "error" || status === "disconnected") && (
              <button 
                onClick={handleManualRefresh}
                className="px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs"
              >
                Reconnect
              </button>
            )}
            
            {status === "connected" && (
              <button 
                onClick={handleManualRefresh}
                className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 rounded-md text-xs"
              >
                Force Refresh
              </button>
            )}
          </div>
        </div>
        
        {!orderBookData ? (
          <div className="text-center p-4 text-muted-foreground">
            Waiting for order book data...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Bids - Left Column */}
            <div>
              <div className="flex items-center mb-2 font-medium text-green-500">
                <ArrowUp className="w-4 h-4 mr-1" />
                Bids
              </div>
              <div className="space-y-0.5">
                <div className="grid grid-cols-3 text-xs mb-1 text-muted-foreground">
                  <div>Price</div>
                  <div className="text-right">Size</div>
                  <div className="text-right">Total</div>
                </div>
                
                {Object.entries(orderBookData.bids)
                  .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
                  .slice(0, 10)
                  .map(([price, size], index) => (
                    <div 
                      key={`bid-${price}`} 
                      className={`grid grid-cols-3 text-xs py-0.5 ${
                        orderBookData.best_bid === parseFloat(price) 
                          ? 'bg-green-500/10 font-medium' 
                          : ''
                      }`}
                    >
                      <div className="flex items-center">
                        {orderBookData.best_bid === parseFloat(price) && (
                          <Tag className="w-3 h-3 mr-1 text-green-500" />
                        )}
                        <span className="text-green-500">{formatPrice(price)}</span>
                      </div>
                      <div className="text-right">{formatSize(size)}</div>
                      <div className="text-right">${formatSize(size * parseFloat(price))}</div>
                    </div>
                  ))
                }
              </div>
            </div>
            
            {/* Asks - Right Column */}
            <div>
              <div className="flex items-center mb-2 font-medium text-red-500">
                <ArrowDown className="w-4 h-4 mr-1" />
                Asks
              </div>
              <div className="space-y-0.5">
                <div className="grid grid-cols-3 text-xs mb-1 text-muted-foreground">
                  <div>Price</div>
                  <div className="text-right">Size</div>
                  <div className="text-right">Total</div>
                </div>
                
                {Object.entries(orderBookData.asks)
                  .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                  .slice(0, 10)
                  .map(([price, size], index) => (
                    <div 
                      key={`ask-${price}`} 
                      className={`grid grid-cols-3 text-xs py-0.5 ${
                        orderBookData.best_ask === parseFloat(price) 
                          ? 'bg-red-500/10 font-medium' 
                          : ''
                      }`}
                    >
                      <div className="flex items-center">
                        {orderBookData.best_ask === parseFloat(price) && (
                          <Tag className="w-3 h-3 mr-1 text-red-500" />
                        )}
                        <span className="text-red-500">{formatPrice(price)}</span>
                      </div>
                      <div className="text-right">{formatSize(size)}</div>
                      <div className="text-right">${formatSize(size * parseFloat(price))}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}
        
        {orderBookData && (
          <Card className="mt-4 p-2 bg-primary-foreground">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Best Bid</div>
                <div className="text-green-500 font-medium">
                  {orderBookData.best_bid ? formatPrice(orderBookData.best_bid) : 'N/A'}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-muted-foreground">Spread</div>
                <div className="font-medium">
                  {orderBookData.spread ? orderBookData.spread : 'N/A'}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-muted-foreground">Best Ask</div>
                <div className="text-red-500 font-medium">
                  {orderBookData.best_ask ? formatPrice(orderBookData.best_ask) : 'N/A'}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
