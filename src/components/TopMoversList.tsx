
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import { InsightPostBox } from './market/InsightPostBox';
import { MarketStatsBento } from './market/MarketStatsBento';
import { TopMoversContent } from './market/TopMoversContent';
import { TransactionDialog } from './market/TransactionDialog';
import { useDebounce } from '@/hooks/use-debounce';
import { useTopMovers } from '@/hooks/useTopMovers';
import { useMarketSearch } from '@/hooks/useMarketSearch';
import { useIsMobile } from '@/hooks/use-mobile';

interface TimeInterval {
  label: string;
  value: string;
}

export interface TopMover {
  market_id: string;
  question: string;
  url: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  description?: string;
  clobtokenids?: string[];
  outcomes?: string[];
  active: boolean;
  closed: boolean;
  archived: boolean;
  image: string;
  event_id: string;
  event_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_no_best_ask?: number;
  final_no_best_bid?: number;
  final_volume: number;
  initial_last_traded_price: number;
  initial_volume: number;
  price_change: number;
  volume_change: number;
  volume_change_percentage: number;
}

interface TopMoversListProps {
  timeIntervals: readonly TimeInterval[];
  selectedInterval: string;
  onIntervalChange: (interval: string) => void;
  openMarketsOnly: boolean;
  onOpenMarketsChange: (value: boolean) => void;
  searchQuery: string;
  probabilityRange: [number, number];
  showMinThumb: boolean;
  showMaxThumb: boolean;
  priceChangeRange: [number, number];
  showPriceChangeMinThumb: boolean;
  showPriceChangeMaxThumb: boolean;
  volumeRange: [number, number];
  showVolumeMinThumb: boolean;
  showVolumeMaxThumb: boolean;
  sortBy: 'price_change' | 'volume';
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
  openMarketsOnly,
  onOpenMarketsChange,
  searchQuery,
  probabilityRange,
  showMinThumb,
  showMaxThumb,
  priceChangeRange,
  showPriceChangeMinThumb,
  showPriceChangeMaxThumb,
  volumeRange,
  showVolumeMinThumb,
  showVolumeMaxThumb,
  sortBy,
}: TopMoversListProps) {
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<{ 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
    selectedOutcome: string;
  } | null>(null);
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isOrderBookLoading, setIsOrderBookLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const debouncedProbabilityRange = useDebounce(probabilityRange, 300);
  const debouncedPriceChangeRange = useDebounce(priceChangeRange, 300);
  const debouncedVolumeRange = useDebounce(volumeRange, 300);
  const { toast } = useToast();
  const { marketId } = useParams();
  const isMobile = useIsMobile();

  const topMoversQuery = useTopMovers(
    selectedInterval, 
    openMarketsOnly, 
    debouncedSearch, 
    marketId,
    showMinThumb ? debouncedProbabilityRange[0] : undefined,
    showMaxThumb ? debouncedProbabilityRange[1] : undefined,
    showPriceChangeMinThumb ? debouncedPriceChangeRange[0] : undefined,
    showPriceChangeMaxThumb ? debouncedPriceChangeRange[1] : undefined,
    showVolumeMinThumb ? debouncedVolumeRange[0] : undefined,
    showVolumeMaxThumb ? debouncedVolumeRange[1] : undefined,
    sortBy
  );

  const marketSearchQuery = useMarketSearch(
    debouncedSearch, 
    searchPage, 
    showMinThumb ? debouncedProbabilityRange[0] : undefined,
    showMaxThumb ? debouncedProbabilityRange[1] : undefined
  );

  useEffect(() => {
    if (marketId) {
      setExpandedMarkets(new Set([marketId]));
    } else {
      setExpandedMarkets(new Set());
    }
  }, [marketId]);

  useEffect(() => {
    setSearchPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!selectedMarket) {
      setOrderBookData(null);
      return;
    }
    setIsOrderBookLoading(true);
  }, [selectedMarket]);

  const handleOrderBookData = (data: OrderBookData | null) => {
    console.log('[TopMoversList] Setting orderbook data:', data);
    
    if (data === null) {
      setOrderBookData(null);
      setIsOrderBookLoading(false);
      return;
    }
    
    if (selectedMarket) {
      setOrderBookData(data);
      setIsOrderBookLoading(false);
    } else {
      console.warn('[TopMoversList] Received orderbook data but no market is selected');
      setOrderBookData(null);
    }
  };

  const isSearching = debouncedSearch.length > 0 && !marketId;
  const activeQuery = isSearching ? marketSearchQuery : topMoversQuery;
  const displayedMarkets = (isSearching ? marketSearchQuery.data?.data : topMoversQuery.data?.pages.flatMap(page => page.data)) || [];
  const hasMore = isSearching ? marketSearchQuery.data?.hasMore : (!marketId && topMoversQuery.hasNextPage);

  const handleTransaction = () => {
    if (!selectedMarket || !orderBookData) return;
    
    const action = selectedMarket.action;
    const price = action === 'buy' ? orderBookData.best_ask : orderBookData.best_bid;
    
    toast({
      title: "Transaction Submitted",
      description: `Your ${action} order has been submitted at ${(price * 100).toFixed(2)}¢`,
    });
    setSelectedMarket(null);
    setOrderBookData(null);
  };

  const handleMarketSelection = (market: { 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
    selectedOutcome: string;
  } | null) => {
    console.log('[TopMoversList] Setting selected market:', market);
    
    if (market?.id !== selectedMarket?.id) {
      setOrderBookData(null);
    }
    
    setSelectedMarket(market);
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

  const handleLoadMore = () => {
    if (isSearching) {
      setSearchPage(prev => prev + 1);
    } else {
      topMoversQuery.fetchNextPage();
    }
  };

  const selectedTopMover = selectedMarket 
    ? displayedMarkets.find(m => m.market_id === selectedMarket.id)
    : null;

  const sortedMarkets = displayedMarkets;

  return (
    <div className={`flex flex-col items-center space-y-6 pt-6 ${isMobile ? 'px-2' : 'border border-white/5 rounded-lg bg-black/20'}`}>
      <InsightPostBox />
      <MarketStatsBento selectedInterval={selectedInterval} />
      
      <TopMoversContent
        isLoading={activeQuery.isLoading}
        error={activeQuery.error ? String(activeQuery.error) : null}
        topMovers={sortedMarkets}
        expandedMarkets={expandedMarkets}
        toggleMarket={toggleMarket}
        setSelectedMarket={handleMarketSelection}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoadingMore={
          isSearching 
            ? marketSearchQuery.isFetching 
            : topMoversQuery.isFetchingNextPage
        }
        selectedInterval={selectedInterval}
      />

      <TransactionDialog
        selectedMarket={selectedMarket}
        topMover={selectedTopMover}
        onClose={() => setSelectedMarket(null)}
        orderBookData={orderBookData}
        isOrderBookLoading={isOrderBookLoading}
        onOrderBookData={handleOrderBookData}
        onConfirm={handleTransaction}
      />
    </div>
  );
}
