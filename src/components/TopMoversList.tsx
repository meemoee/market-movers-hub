import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import { Search } from 'lucide-react';
import { Input } from './ui/input';
import { TopMoversHeader } from './market/TopMoversHeader';
import { TopMoversContent } from './market/TopMoversContent';
import { TransactionDialog } from './market/TransactionDialog';
import { MarketStatsBento } from './market/MarketStatsBento';
import { InsightPostBox } from './market/InsightPostBox';
import { useDebounce } from '@/hooks/use-debounce';
import { useTopMovers } from '@/hooks/useTopMovers';
import { useMarketSearch } from '@/hooks/useMarketSearch';
import { useIsMobile } from '@/hooks/use-mobile';

interface TimeInterval {
  label: string;
  value: string;
}

const formatInterval = (minutes: number): string => {
  if (minutes < 60) return `${minutes} mins`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes === 10080) return '1 week';
  return `${minutes / 1440} days`;
};

const TIME_INTERVALS: TimeInterval[] = [
  { label: formatInterval(5), value: '5' },
  { label: formatInterval(10), value: '10' },
  { label: formatInterval(30), value: '30' },
  { label: formatInterval(60), value: '60' },
  { label: formatInterval(240), value: '240' },
  { label: formatInterval(480), value: '480' },
  { label: formatInterval(1440), value: '1440' },
  { label: formatInterval(10080), value: '10080' },
] as const;

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
}

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export default function TopMoversList({
  timeIntervals = TIME_INTERVALS,
  selectedInterval,
  onIntervalChange,
  openMarketsOnly,
  onOpenMarketsChange,
}: TopMoversListProps) {
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<{ 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
    selectedOutcome: string;
  } | null>(null);
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isOrderBookLoading, setIsOrderBookLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [probabilityRange, setProbabilityRange] = useState<[number, number]>([0, 100]);
  const [showMinThumb, setShowMinThumb] = useState(false);
  const [showMaxThumb, setShowMaxThumb] = useState(false);
  const [priceChangeRange, setPriceChangeRange] = useState<[number, number]>([-100, 100]);
  const [showPriceChangeMinThumb, setShowPriceChangeMinThumb] = useState(false);
  const [showPriceChangeMaxThumb, setShowPriceChangeMaxThumb] = useState(false);
  const [volumeRange, setVolumeRange] = useState<[number, number]>([0, 1000000]);
  const [showVolumeMinThumb, setShowVolumeMinThumb] = useState(false);
  const [showVolumeMaxThumb, setShowVolumeMaxThumb] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [sortBy, setSortBy] = useState<'price_change' | 'volume'>('price_change');
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
      setSearchQuery('');
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
    <div className="flex flex-col w-full max-w-full overflow-hidden">
      <div className="sticky top-0 z-40 w-full flex flex-col bg-background/95 backdrop-blur-sm rounded-b-lg">
        {!marketId && (
          <div className="flex items-center w-full px-4 py-3 border-b">
            <div className="relative flex-1 max-w-2xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search markets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 bg-background"
              />
            </div>
          </div>
        )}

        <TopMoversHeader
          timeIntervals={timeIntervals}
          selectedInterval={selectedInterval}
          onIntervalChange={onIntervalChange}
          openMarketsOnly={openMarketsOnly}
          onOpenMarketsChange={onOpenMarketsChange}
          isTimeIntervalDropdownOpen={isTimeIntervalDropdownOpen}
          setIsTimeIntervalDropdownOpen={setIsTimeIntervalDropdownOpen}
          probabilityRange={probabilityRange}
          setProbabilityRange={setProbabilityRange}
          showMinThumb={showMinThumb}
          setShowMinThumb={setShowMinThumb}
          showMaxThumb={showMaxThumb}
          setShowMaxThumb={setShowMaxThumb}
          priceChangeRange={priceChangeRange}
          setPriceChangeRange={setPriceChangeRange}
          showPriceChangeMinThumb={showPriceChangeMinThumb}
          setShowPriceChangeMinThumb={setShowPriceChangeMinThumb}
          showPriceChangeMaxThumb={showPriceChangeMaxThumb}
          setShowPriceChangeMaxThumb={setShowPriceChangeMaxThumb}
          volumeRange={volumeRange}
          setVolumeRange={setVolumeRange}
          showVolumeMinThumb={showVolumeMinThumb}
          setShowVolumeMinThumb={setShowVolumeMinThumb}
          showVolumeMaxThumb={showVolumeMaxThumb}
          setShowVolumeMaxThumb={setShowVolumeMaxThumb}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
      </div>
      
      <div className={`w-full ${isMobile ? 'px-0 max-w-[100vw] overflow-hidden' : 'px-0 sm:px-4'}`}>
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
        </div>
      </div>

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
