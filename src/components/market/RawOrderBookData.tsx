import { useEffect, useState } from 'react';
import { Loader2, ArrowDown, ArrowUp, Tag, Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { subscribeToOrderBook, OrderBookData } from '@/services/PolymarketService';
import { useEventListener } from "@/hooks/use-event-listener";

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
  
  useEffect(() => {
    if (!clobTokenId || isClosing) return;
    
    setStatus("connecting");
    console.log(`Subscribing to orderbook updates for token: ${clobTokenId}`);
    
    const unsubscribe = subscribeToOrderBook(
      clobTokenId,
      (data) => {
        setOrderBookData(data);
        setLastUpdateTime(new Date().toLocaleTimeString());
        setStatus("connected");
        setError(null);
        if (onOrderBookData) {
          onOrderBookData(data);
        }
      },
      (error) => {
        console.error("Orderbook subscription error:", error);
        setStatus("error");
        setError(error.message);
      }
    );
    
    return () => {
      console.log("Cleaning up orderbook subscription");
      unsubscribe();
    };
  }, [clobTokenId, isClosing, onOrderBookData]);

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
                className="px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs"
              >
                Reconnect
              </button>
            )}
            
            {status === "connected" && (
              <button 
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
