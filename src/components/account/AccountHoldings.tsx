import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { useQuery } from "@tanstack/react-query";

interface Holding {
  id: string;
  market_id: string;
  entry_price: number | null;
  outcome: string;
  market: {
    question: string;
    image: string | null;
    outcomes: string[] | null;
  } | null;
}

interface MarketPrice {
  market_id: string;
  last_traded_price: number;
  timestamp: string;
}

interface TopMoverData {
  market_id: string;
  price_change: number;
  final_last_traded_price: number;
}

export function AccountHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInterval, setSelectedInterval] = useState("1440"); // Default to 24h

  // Fetch latest prices and price changes for all markets in holdings
  const { data: marketData } = useQuery({
    queryKey: ['topMovers', holdings.map(h => h.market_id), selectedInterval],
    queryFn: async () => {
      if (holdings.length === 0) return {};
      
      const { data: topMoversData, error: topMoversError } = await supabase.functions.invoke<{
        data: TopMoverData[];
      }>('get-top-movers', {
        body: {
          interval: selectedInterval,
          openOnly: false,
          page: 1,
          limit: 100,
          marketIds: holdings.map(h => h.market_id)
        }
      });

      if (topMoversError) throw topMoversError;

      // Convert to map for easy lookup
      return (topMoversData?.data || []).reduce((acc, mover) => ({
        ...acc,
        [mover.market_id]: {
          currentPrice: mover.final_last_traded_price,
          priceChange: mover.price_change
        }
      }), {});
    },
    enabled: holdings.length > 0,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  useEffect(() => {
    fetchHoldings();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'holdings'
        },
        (payload) => {
          console.log('New holding detected:', payload);
          fetchHoldings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchHoldings = async () => {
    try {
      const { data, error } = await supabase
        .from('holdings')
        .select(`
          id,
          market_id,
          entry_price,
          outcome,
          market:markets (
            question,
            image,
            outcomes
          )
        `);

      if (error) throw error;
      
      // Transform the data to ensure outcomes is properly typed
      const transformedData = (data || []).map(holding => ({
        ...holding,
        market: holding.market ? {
          ...holding.market,
          outcomes: Array.isArray(holding.market.outcomes) 
            ? holding.market.outcomes.map(outcome => String(outcome))
            : null
        } : null
      }));
      
      setHoldings(transformedData);
    } catch (error) {
      console.error('Error fetching holdings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAdjustedPrice = (price: number | null, holding: Holding) => {
    if (!price || !holding.market?.outcomes) return price;
    
    // Check if this is a No outcome (second outcome in the array)
    const isNoOutcome = holding.outcome === holding.market.outcomes[1];
    return isNoOutcome ? 1 - price : price;
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading holdings...</div>;
  }

  if (holdings.length === 0) {
    return <div className="text-sm text-muted-foreground">No holdings yet</div>;
  }

  return (
    <Card className="border p-0 overflow-hidden">
      <ScrollArea className="h-[400px]">
        <div>
          {holdings.map((holding, index) => {
            const marketInfo = marketData?.[holding.market_id];
            const isNoOutcome = holding.market?.outcomes ? holding.outcome === holding.market.outcomes[1] : false;
            
            // Only adjust current price for No outcomes, entry price is already correct
            const currentPrice = marketInfo ? getAdjustedPrice(marketInfo.currentPrice, holding) : null;
            const priceChange = marketInfo?.priceChange;
            
            return (
              <div key={holding.id}>
                <div className="p-4 flex items-start gap-3">
                  {holding.market?.image && (
                    <img
                      src={holding.market.image}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-2 mb-1">
                      {holding.market?.question || 'Unknown Market'}
                    </p>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Outcome: {holding.outcome}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Entry Price: ${holding.entry_price?.toFixed(2) || '0.00'}
                      </p>
                      {currentPrice && (
                        <p className="text-sm">
                          Current Price: ${currentPrice.toFixed(2)}
                          {priceChange && (
                            <span className={`ml-2 ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {index < holdings.length - 1 && <Separator />}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}