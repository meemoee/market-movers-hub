import { useState, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { MarketCard } from './market/MarketCard';
import { OrderBook } from './market/OrderBook';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TimeInterval {
  label: string;
  value: string;
}

interface TopMoversListProps {
  topMovers: TopMover[];
  error: string | null;
  timeIntervals: readonly TimeInterval[];
  selectedInterval: string;
  onIntervalChange: (interval: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  openMarketsOnly: boolean;
  onOpenMarketsChange: (value: boolean) => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
}

interface TopMover {
  market_id: string;
  question: string;
  price: number;
  price_change: number;
  volume: number;
  image: string;
  yes_sub_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  volume_change: number;
  volume_change_percentage: number;
  url: string;
  outcomes?: string[] | string;
  description?: string;
}

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export default function TopMoversList({
  timeIntervals,
  selectedInterval,
  onIntervalChange,
  topMovers,
  error,
  onLoadMore,
  hasMore,
  openMarketsOnly,
  onOpenMarketsChange,
  isLoading,
  isLoadingMore,
}: TopMoversListProps) {
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<{ id: string; action: 'buy' | 'sell' } | null>(null);
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!selectedMarket) return;

    setIsConnecting(true);
    setOrderBookData(null);

    // Test endpoint first to ensure the WebSocket server is running
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-ws/test`)
      .then(response => response.json())
      .then(data => {
        if (!data.received_data) {
          throw new Error('WebSocket server test failed');
        }
        console.log('WebSocket server test successful:', data);
        
        // Now connect to the WebSocket
        const wsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-ws`;
        console.log('Connecting to WebSocket:', wsUrl);
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Connected to Polymarket WebSocket');
          const subscriptionMessage = {
            type: 'subscribe',
            marketId: selectedMarket.id
          };
          console.log('Sending subscription message:', subscriptionMessage);
          ws.send(JSON.stringify(subscriptionMessage));
        };

        ws.onmessage = (event) => {
          try {
            console.log('Received WebSocket message:', event.data);
            const data = JSON.parse(event.data);
            if (data.bids && data.asks) {
              setOrderBookData(data);
              setIsConnecting(false);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            toast({
              title: "Data Error",
              description: "Failed to parse orderbook data. Please try again.",
              variant: "destructive",
            });
            setIsConnecting(false);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnecting(false);
          toast({
            title: "Connection Error",
            description: "Failed to connect to orderbook data. Please try again.",
            variant: "destructive",
          });
        };

        ws.onclose = () => {
          console.log('WebSocket connection closed');
          setIsConnecting(false);
        };

        return () => {
          console.log('Cleaning up WebSocket connection');
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
      })
      .catch(error => {
        console.error('WebSocket server test failed:', error);
        setIsConnecting(false);
        toast({
          title: "Connection Error",
          description: "Failed to connect to orderbook data. Please try again.",
          variant: "destructive",
        });
      });
  }, [selectedMarket, toast]);

  const toggleMarket = (marketId: string) => {
    setExpandedMarkets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(marketId)) {
        newSet.delete(marketId);
      } else {
        newSet.add(marketId);
      }
      return newSet;
    });
  };

  const handleTransaction = () => {
    if (!selectedMarket || !orderBookData) return;
    
    const action = selectedMarket.action;
    const price = action === 'buy' ? orderBookData.best_ask : orderBookData.best_bid;
    
    toast({
      title: "Transaction Submitted",
      description: `Your ${action} order has been submitted at ${(price * 100).toFixed(2)}¢`,
    });
    setSelectedMarket(null);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="sticky top-14 bg-card/95 backdrop-blur-sm z-40 mb-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Market Movers</h2>
            <div className="relative">
              <button
                onClick={() => setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/50 hover:bg-accent/70 transition-colors"
              >
                <span>{timeIntervals.find(i => i.value === selectedInterval)?.label}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {isTimeIntervalDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-xl">
                  {timeIntervals.map((interval) => (
                    <button
                      key={interval.value}
                      className={`w-full px-4 py-2 text-left hover:bg-accent/50 transition-colors ${
                        selectedInterval === interval.value ? 'bg-accent/30' : ''
                      }`}
                      onClick={() => {
                        setIsTimeIntervalDropdownOpen(false);
                        onIntervalChange(interval.value);
                      }}
                    >
                      {interval.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={openMarketsOnly}
              onChange={e => onOpenMarketsChange(e.target.checked)}
              className="rounded border-border bg-transparent"
            />
            <span className="text-sm text-muted-foreground">Open Markets Only</span>
          </label>
        </div>
      </Card>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-3 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            topMovers.map((mover) => (
              <MarketCard
                key={mover.market_id}
                market={mover}
                isExpanded={expandedMarkets.has(mover.market_id)}
                onToggleExpand={() => toggleMarket(mover.market_id)}
                onBuy={() => setSelectedMarket({ id: mover.market_id, action: 'buy' })}
                onSell={() => setSelectedMarket({ id: mover.market_id, action: 'sell' })}
              />
            ))
          )}

          {hasMore && !isLoading && (
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full py-3 bg-accent/50 hover:bg-accent/70 rounded-lg transition-colors
                flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      </ScrollArea>

      <AlertDialog 
        open={selectedMarket !== null} 
        onOpenChange={() => setSelectedMarket(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {selectedMarket?.action === 'buy' ? 'Purchase' : 'Sale'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {isConnecting ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="ml-2">Connecting to order book...</span>
                </div>
              ) : orderBookData ? (
                <>
                  <p>Current market prices:</p>
                  <div className="grid grid-cols-2 gap-4 bg-accent/20 p-4 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Best Bid</p>
                      <p className="text-lg font-medium text-green-500">
                        {(orderBookData.best_bid * 100).toFixed(2)}¢
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Best Ask</p>
                      <p className="text-lg font-medium text-red-500">
                        {(orderBookData.best_ask * 100).toFixed(2)}¢
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Spread: {((orderBookData.best_ask - orderBookData.best_bid) * 100).toFixed(2)}¢
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-center py-4 text-destructive">
                  Failed to load order book data. Please try again.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransaction}
              disabled={!orderBookData || isConnecting}
              className={selectedMarket?.action === 'buy' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Connecting...
                </>
              ) : (
                `Confirm ${selectedMarket?.action}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
