
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MarketCard } from '@/components/market/MarketCard';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import RightSidebar from "@/components/RightSidebar";
import AccountIsland from "@/components/AccountIsland";
import { TopMoversHeader } from '@/components/market/TopMoversHeader';
import { InsightPostBox } from '@/components/market/InsightPostBox';
import { MarketStatsBento } from '@/components/market/MarketStatsBento';

const TIME_INTERVALS = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: 'ALL', value: 'all' }
] as const;

export function MarketPage() {
  const { marketId } = useParams();
  const [selectedInterval, setSelectedInterval] = useState('1d');
  const [expandedMarkets] = useState(new Set([marketId])); // Always expanded
  const [openMarketsOnly, setOpenMarketsOnly] = useState(true);
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);

  const { data: market, isLoading } = useQuery({
    queryKey: ['market', marketId],
    queryFn: async () => {
      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .select(`
          *,
          market_prices (
            last_traded_price,
            timestamp,
            volume,
            best_bid,
            best_ask
          )
        `)
        .eq('id', marketId)
        .single();

      if (marketError) throw marketError;

      // Get price history for market
      const { data: prices } = await supabase
        .from('market_prices')
        .select('last_traded_price, timestamp, volume, best_bid, best_ask')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: true });

      if (!prices?.length) return null;

      const initialPrice = prices[0]?.last_traded_price || 0;
      const finalPrice = prices[prices.length - 1]?.last_traded_price || 0;
      const priceChange = finalPrice - initialPrice;
      
      const totalVolume = prices.reduce((sum, price) => sum + (price.volume || 0), 0);
      const latestBid = prices[prices.length - 1]?.best_bid || 0;
      const latestAsk = prices[prices.length - 1]?.best_ask || 0;

      // Ensure outcomes is always an array of strings
      const outcomes = Array.isArray(marketData.outcomes) 
        ? marketData.outcomes as string[]
        : ["Yes", "No"];

      return {
        market_id: marketData.id,
        question: marketData.question,
        price: finalPrice,
        price_change: priceChange,
        volume: totalVolume,
        image: marketData.image || '/placeholder.svg',
        yes_sub_title: marketData.yes_sub_title,
        final_last_traded_price: finalPrice,
        final_best_ask: latestAsk,
        final_best_bid: latestBid,
        description: marketData.description || '',
        outcomes: outcomes,
        event_id: marketData.event_id,
      };
    },
    enabled: !!marketId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-medium">Market not found</h2>
          <p className="text-muted-foreground mt-2">The market you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Purple Glow Effect */}
      <div className="fixed top-0 right-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full opacity-30 scale-150 translate-x-1/4 -translate-y-1/4 blur-3xl bg-gradient-to-br from-purple-500 via-violet-500 to-fuchsia-500" />
      </div>
      
      <main className="container mx-auto xl:pr-[400px] px-4 relative z-10">
        <div className="relative flex max-w-[1280px] mx-auto justify-center">
          <aside className="w-[280px] relative">
            <div className="sticky top-0">
              <img 
                src="/hunchex-logo.svg" 
                alt="Hunchex" 
                className="h-8 mb-4 ml-6 mt-6"
              />
              <AccountIsland />
            </div>
          </aside>

          <div className="flex-1 min-w-0 min-h-screen">
            <div className="sticky top-0 z-40 w-full flex flex-col bg-background/95 backdrop-blur-sm rounded-b-lg">
              <TopMoversHeader
                timeIntervals={TIME_INTERVALS}
                selectedInterval={selectedInterval}
                onIntervalChange={setSelectedInterval}
                openMarketsOnly={openMarketsOnly}
                onOpenMarketsChange={setOpenMarketsOnly}
                isTimeIntervalDropdownOpen={isTimeIntervalDropdownOpen}
                setIsTimeIntervalDropdownOpen={setIsTimeIntervalDropdownOpen}
              />
            </div>
            
            <div className="w-full px-0 sm:px-4 -mt-20">
              <div className="flex flex-col items-center space-y-6 pt-28 border border-white/5 rounded-lg bg-black/20">
                <InsightPostBox />
                <MarketStatsBento selectedInterval={selectedInterval} />
                
                <div className="w-full space-y-3">
                  <MarketCard
                    market={market}
                    isExpanded={expandedMarkets.has(marketId)}
                    onToggleExpand={() => {}}
                    onBuy={() => {}}
                    onSell={() => {}}
                    selectedInterval={selectedInterval}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}
