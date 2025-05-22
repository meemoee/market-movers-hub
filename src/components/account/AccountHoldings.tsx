import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

export interface Holding {
  id: string;
  market_id: string;
  entry_price: number | null;
  outcome: string;
  amount: number | null;
  market: {
    question: string;
    image: string | null;
    outcomes: string[] | null;
  } | null;
}

interface AccountHoldingsProps {
  onSelectHolding?: (holding: Holding) => void;
  selectedHoldingId?: string;
}

export function AccountHoldings({ onSelectHolding, selectedHoldingId }: AccountHoldingsProps) {
  const [selectedInterval, setSelectedInterval] = useState("1440"); // Default to 24h
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query for holdings with proper staleTime and cacheTime settings
  const { data: holdings = [], isLoading, isError } = useQuery({
    queryKey: ['userHoldings', user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('holdings')
          .select(`
            id,
            market_id,
            entry_price,
            outcome,
            amount,
            market:markets (
              question,
              image,
              outcomes
            )
          `)
          .eq('user_id', user?.id);

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
        
        return transformedData;
      } catch (error) {
        console.error('Error fetching holdings:', error);
        return [];
      }
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: false,
    staleTime: 60000, // 1 minute
    gcTime: 300000,   // 5 minutes
  });

  // Query for market prices
  const { data: latestPrices } = useQuery({
    queryKey: ['latestPrices', holdings.map(h => h.market_id), selectedInterval],
    queryFn: async () => {
      if (holdings.length === 0) return {};
      
      // Get price changes from the top movers cache
      const { data: topMoversData, error: topMoversError } = await supabase
        .from('market_prices')
        .select('market_id, last_traded_price, timestamp')
        .in('market_id', holdings.map(h => h.market_id))
        .order('timestamp', { ascending: false });

      if (topMoversError) throw topMoversError;

      // Convert to map for easy lookup, keeping the latest price for each market
      // regardless of whether it's zero or not
      const priceMap: Record<string, number> = {};
      (topMoversData || []).forEach(price => {
        // If we haven't seen this market yet, use its price (even if zero)
        if (!(price.market_id in priceMap)) {
          priceMap[price.market_id] = price.last_traded_price;
        }
      });

      return priceMap;
    },
    enabled: holdings.length > 0,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000, // 15 seconds
    gcTime: 60000,    // 1 minute
  });

  // Set up real-time updates for holdings
  useEffect(() => {
    if (!user?.id) return;
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'holdings',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Holdings update detected:', payload);
          // Invalidate the holdings query to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['userHoldings', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const getAdjustedPrice = (price: number | null, holding: Holding) => {
    if (!price || !holding.market?.outcomes) return price;
    
    // Check if this is a No outcome (second outcome in the array)
    const isNoOutcome = holding.outcome === holding.market.outcomes[1];
    return isNoOutcome ? 1 - price : price;
  };

  const calculatePriceChange = (entryPrice: number | null, currentPrice: number | null, isNoOutcome: boolean) => {
    if (!entryPrice || !currentPrice) return null;
    
    // Only adjust current price for No outcomes, entry price is already correct
    const adjustedCurrentPrice = isNoOutcome ? 1 - currentPrice : currentPrice;
    
    return ((adjustedCurrentPrice - entryPrice) / entryPrice) * 100;
  };

  if (isError) {
    return <div className="text-sm text-red-500">Error loading holdings</div>;
  }

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-gray-700/20 rounded"></div>
          <div className="h-10 bg-gray-700/20 rounded"></div>
          <div className="h-10 bg-gray-700/20 rounded"></div>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return <div className="text-sm text-muted-foreground">No holdings yet</div>;
  }

  return (
    <Card className="border p-0 overflow-hidden">
      <ScrollArea className="h-[400px]">
        <div>
          {holdings.map((holding, index) => {
            const rawCurrentPrice = latestPrices?.[holding.market_id];
            const isNoOutcome = holding.market?.outcomes ? holding.outcome === holding.market.outcomes[1] : false;
            
            const currentPrice = getAdjustedPrice(rawCurrentPrice, holding);
            const priceChange = calculatePriceChange(holding.entry_price, rawCurrentPrice, isNoOutcome);
            
            return (
              <div key={holding.id}>
                <div 
                  className={`p-4 flex items-start gap-3 cursor-pointer hover:bg-accent/50 ${
                    selectedHoldingId === holding.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => onSelectHolding?.(holding)}
                >
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
                        Shares: {holding.amount?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Entry Price: ${holding.entry_price?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm">
                        Current Price: ${currentPrice?.toFixed(2) || (holding.entry_price?.toFixed(2) || '0.00')}
                        {priceChange && (
                          <span className={`ml-2 ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%)
                          </span>
                        )}
                      </p>
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
