import { useState, useEffect } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from "@/hooks/use-toast";
import { TopMoversHeader } from './market/TopMoversHeader';
import { TopMoversContent } from './market/TopMoversContent';
import { TransactionDialog } from './market/TransactionDialog';
import { MarketStatsBento } from './market/MarketStatsBento';

interface TimeInterval {
  label: string;
  value: string;
}

interface TopMover {
  market_id: string;
  question: string;
  url: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  description?: string;
  clobtokenids?: string[] | string;
  outcomes?: any;
  active: boolean;
  closed: boolean;
  archived: boolean;
  image: string;
  event_id: string;
  event_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_volume: number;
  initial_last_traded_price: number;
  initial_volume: number;
  price_change: number;
  volume_change: number;
  volume_change_percentage: number;
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
  const [selectedMarket, setSelectedMarket] = useState<{ 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
  } | null>(null);
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isOrderBookLoading, setIsOrderBookLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!selectedMarket) {
      setOrderBookData(null);
      return;
    }
    setIsOrderBookLoading(true);
  }, [selectedMarket]);

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

  const selectedTopMover = selectedMarket 
    ? topMovers.find(m => m.market_id === selectedMarket.id)
    : null;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <TopMoversHeader
        timeIntervals={timeIntervals}
        selectedInterval={selectedInterval}
        onIntervalChange={onIntervalChange}
        openMarketsOnly={openMarketsOnly}
        onOpenMarketsChange={onOpenMarketsChange}
        isTimeIntervalDropdownOpen={isTimeIntervalDropdownOpen}
        setIsTimeIntervalDropdownOpen={setIsTimeIntervalDropdownOpen}
      />
      
      <ScrollArea className="h-[calc(100vh-144px)]">
        <div className="pt-3 px-1 w-full space-y-3">
          <div className="px-4">
            <MarketStatsBento />
          </div>

          <TopMoversContent
            isLoading={isLoading || false}
            error={error}
            topMovers={topMovers}
            expandedMarkets={expandedMarkets}
            toggleMarket={toggleMarket}
            setSelectedMarket={(market) => {
              if (!market) {
                setSelectedMarket(null);
                return;
              }
              
              const mover = topMovers.find(m => m.market_id === market.id);
              console.log('Selected mover:', mover);
              
              if (!mover) {
                console.error('No mover found:', { market });
                toast({
                  title: "Error",
                  description: "Unable to process this market at the moment",
                  variant: "destructive",
                });
                return;
              }

              const defaultTokenIds = ['1', '2'];
              
              let tokenIds: string[] = defaultTokenIds;
              if (mover.clobtokenids) {
                try {
                  if (typeof mover.clobtokenids === 'string') {
                    const parsed = JSON.parse(mover.clobtokenids);
                    if (Array.isArray(parsed) && parsed.length >= 2) {
                      tokenIds = parsed;
                    }
                  } else if (Array.isArray(mover.clobtokenids) && mover.clobtokenids.length >= 2) {
                    tokenIds = mover.clobtokenids;
                  }
                } catch (err) {
                  console.error('Error parsing clobtokenids:', err);
                }
              }

              console.log('Using tokenIds:', tokenIds);
              
              const clobTokenId = market.action === 'buy' ? tokenIds[0] : tokenIds[1];
              console.log('Selected clobTokenId:', clobTokenId);
              
              setSelectedMarket({
                ...market,
                clobTokenId
              });
            }}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
        </div>
      </ScrollArea>

      <TransactionDialog
        selectedMarket={selectedMarket}
        topMover={selectedTopMover}
        onClose={() => setSelectedMarket(null)}
        orderBookData={orderBookData}
        isOrderBookLoading={isOrderBookLoading}
        onOrderBookData={(data) => {
          setOrderBookData(data);
          setIsOrderBookLoading(false);
        }}
        onConfirm={handleTransaction}
      />
    </div>
  );
}
