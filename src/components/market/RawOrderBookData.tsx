
import { useEffect, useState, useRef } from 'react';
import { Loader2, ArrowDown, ArrowUp, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

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
}

export function RawOrderBookData({ clobTokenId, isClosing }: RawOrderBookProps) {
  const [status, setStatus] = useState<string>("disconnected");
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  
  useEffect(() => {
    if (isClosing || !clobTokenId) return;
    
    // Clear previous reconnect timeout if any
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    const fetchInitialOrderBookData = async () => {
      try {
        setStatus("connecting");
        console.log(`Connecting to order book stream for token: ${clobTokenId}`);
        
        const { data, error } = await supabase.functions.invoke('polymarket-stream', {
          body: { tokenId: clobTokenId }
        });
        
        if (error) {
          console.error("WebSocket stream failed:", error);
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
          reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
        }
      } catch (err) {
        console.error("Error fetching order book data:", err);
        setStatus("error");
        setError(`Connection failed: ${(err as Error).message}`);
        scheduleReconnect();
      }
    };
    
    const scheduleReconnect = () => {
      // Exponential backoff with max of 10 seconds
      const backoff = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
      reconnectAttemptsRef.current++;
      
      console.log(`Scheduling reconnection in ${backoff/1000} seconds... (attempt ${reconnectAttemptsRef.current})`);
      
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (!isClosing && clobTokenId) {
          console.log('Attempting reconnection...');
          fetchInitialOrderBookData();
        }
      }, backoff);
    };
    
    // Initial fetch
    fetchInitialOrderBookData();
    
    // Cleanup function
    return () => {
      console.log("Cleaning up order book connection");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [clobTokenId, isClosing]);

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
    
    setStatus("connecting");
    
    try {
      const { data, error } = await supabase.functions.invoke('polymarket-stream', {
        body: { tokenId: clobTokenId }
      });
      
      if (error) {
        setStatus("error");
        setError(error.message);
        return;
      }
      
      setOrderBookData(data as OrderBookData);
      setStatus("connected");
      setError(null);
      setLastUpdateTime(new Date().toLocaleTimeString());
    } catch (err) {
      setStatus("error");
      setError(`Failed to refresh: ${(err as Error).message}`);
    }
  };

  // Render loading state
  if (status === "connecting" && !orderBookData) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Fetching order book data...</span>
      </div>
    );
  }
  
  // Render data display
  return (
    <div className="h-[300px] overflow-y-auto bg-background/50 border border-border rounded-md p-2">
      <div className="text-xs">
        <div className="sticky top-0 bg-background/90 mb-2 py-1 border-b border-border z-10">
          <div className="flex justify-between items-center">
            <div>
              Status: <span className={
                status === "connected" ? "text-green-500" :
                status === "connecting" ? "text-yellow-500" :
                status === "error" ? "text-red-500" :
                "text-muted-foreground"
              }>{status}</span>
              {error && <span className="text-red-500 ml-2">Error: {error}</span>}
            </div>
            
            <div className="text-xs text-muted-foreground">
              Last update: {lastUpdateTime || 'N/A'}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1 mt-1">
            {(status === "error" || status === "disconnected") && (
              <button 
                onClick={handleManualRefresh}
                className="px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs"
              >
                Retry
              </button>
            )}
            
            {status === "connected" && (
              <button 
                onClick={handleManualRefresh}
                className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 rounded-md text-xs"
              >
                Refresh Now
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
