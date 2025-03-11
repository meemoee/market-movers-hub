
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 5;
  
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
        scheduleReconnect();
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
      scheduleReconnect();
    }
  };

  // Connect to WebSocket
  const connectWebSocket = () => {
    if (!clobTokenId || isClosing || wsRef.current) return;
    
    try {
      setStatus("connecting");
      
      // Close any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      const projectId = 'lfmkoismabbhujycnqpn';
      const wsUrl = `wss://${projectId}.functions.supabase.co/orderbook-stream?tokenId=${clobTokenId}`;
      
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connection established');
        setStatus("connected");
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset reconnect counter on successful connection
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'orderbook_update') {
            setOrderBookData(message.data);
            setLastUpdateTime(new Date().toLocaleTimeString());
          } else if (message.type === 'error') {
            console.error('WebSocket error message:', message.message);
            setError(message.message);
          } else if (message.type === 'disconnected') {
            setStatus("disconnected");
            setError(message.message);
            scheduleReconnect();
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
      
      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setStatus("error");
        setError('WebSocket connection error');
      };
      
      wsRef.current.onclose = (event) => {
        console.log(`WebSocket closed: code=${event.code}, reason=${event.reason || 'No reason provided'}`);
        
        if (status !== "disconnected") {
          setStatus("disconnected");
        }
        
        wsRef.current = null;
        
        if (!isClosing) {
          scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('Error establishing WebSocket connection:', err);
      setStatus("error");
      setError(`Failed to connect: ${(err as Error).message}`);
      wsRef.current = null;
      scheduleReconnect();
    }
  };
  
  // Schedule WebSocket reconnection with exponential backoff
  const scheduleReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log(`Max reconnect attempts (${maxReconnectAttempts}) reached, falling back to REST API`);
      fetchInitialOrderBookData();
      return;
    }
    
    // Exponential backoff with max of 10 seconds
    const backoff = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
    reconnectAttemptsRef.current++;
    
    console.log(`Scheduling reconnection in ${backoff/1000} seconds... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
    
    reconnectTimeoutRef.current = window.setTimeout(() => {
      if (!isClosing) {
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          console.log('Attempting WebSocket reconnection...');
          connectWebSocket();
        } else {
          console.log('Falling back to REST API after max reconnect attempts');
          fetchInitialOrderBookData();
        }
      }
    }, backoff);
  };
  
  // Initialize connection
  useEffect(() => {
    if (isClosing || !clobTokenId) return;
    
    // Clear previous reconnect timeout if any
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // First try WebSocket connection
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
    if (status === "disconnected" && !isClosing && clobTokenId && !wsRef.current) {
      console.log('Window focused, attempting to reconnect WebSocket');
      connectWebSocket();
    }
  });

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

  // Handle manual refresh
  const handleManualRefresh = async () => {
    if (!clobTokenId) return;
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket connection already active, no need to refresh');
      return;
    }
    
    // Try to reconnect WebSocket first
    connectWebSocket();
    
    // If still not connected after a short delay, fall back to REST API
    setTimeout(() => {
      if (status !== "connected") {
        fetchInitialOrderBookData();
      }
    }, 1000);
  };

  // Render loading state
  if (status === "connecting" && !orderBookData) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Connecting to order book stream...</span>
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
              ) : (
                <WifiOff className="h-3 w-3 mr-1 text-red-500" />
              )}
              <span className={
                status === "connected" ? "text-green-500" :
                status === "connecting" ? "text-yellow-500" :
                status === "error" ? "text-red-500" :
                "text-muted-foreground"
              }>{status}</span>
              {error && <span className="text-red-500 ml-2 text-[10px]">Error: {error}</span>}
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
