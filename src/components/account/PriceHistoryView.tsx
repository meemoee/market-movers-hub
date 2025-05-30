
import { useState, useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import PriceChart from '../market/PriceChart';
import { toast } from 'sonner';
import { Holding } from './AccountHoldings';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface PriceHistoryViewProps {
  marketId?: string | null;
  question?: string;
  holdings?: Holding[];
}

export function PriceHistoryView({ marketId, question, holdings = [] }: PriceHistoryViewProps) {
  const [showCumulativePnL, setShowCumulativePnL] = useState(false);
  // For backward compatibility, use marketId if holdings is not provided
  const effectiveMarketIds = holdings.length > 0 
    ? holdings.map(h => h.market_id) 
    : (marketId ? [marketId] : []);
  
  const effectiveQuestion = holdings.length === 1 
    ? holdings[0].market?.question || 'Selected Market'
    : question || 'Selected Markets';
  const [selectedChartInterval, setSelectedChartInterval] = useState('1d');

  // Generate a unique color for each holding
  const colorMap = useMemo(() => {
    const colors = [
      '#3b82f6', // blue
      '#ef4444', // red
      '#10b981', // green
      '#f59e0b', // amber
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#f97316', // orange
    ];
    
    const map = new Map<string, string>();
    
    effectiveMarketIds.forEach((id, index) => {
      map.set(id, colors[index % colors.length]);
    });
    
    return map;
  }, [effectiveMarketIds]);

  // Fetch price history for each market - ensure we always have an array
  const priceHistoryQueries = useQueries({
    queries: effectiveMarketIds.map(id => ({
      queryKey: ['priceHistory', id, selectedChartInterval],
      queryFn: async () => {
        try {
          const response = await supabase.functions.invoke<{ t: string; y: number; lastUpdated?: number }[]>('price-history', {
            body: JSON.stringify({ 
              marketId: id, 
              interval: selectedChartInterval,
              fetchAllIntervals: true // Signal to fetch all intervals in the background if needed
            })
          });

          if (response.error) {
            console.error(`Price history error for ${id}:`, response.error);
            toast.error(`Failed to load price history: ${response.error.message}`);
            throw response.error;
          }
          
          return {
            marketId: id,
            points: response.data.map(point => ({
              time: new Date(point.t).getTime(),
              price: point.y * 100
            })),
            lastUpdated: response.data[0]?.lastUpdated
          };
        } catch (error) {
          console.error(`Error fetching price history for ${id}:`, error);
          toast.error('Could not load price history. Please try again later.');
          throw error;
        }
      },
      enabled: !!id,
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 60000, // 1 minute
      gcTime: 300000, // 5 minutes
    }))
  });

  // Ensure priceHistoryQueries is always an array
  const safeQueries = Array.isArray(priceHistoryQueries) ? priceHistoryQueries : [];
  
  const isLoading = safeQueries.some(query => query.isLoading);
  const hasData = safeQueries.some(query => query.data?.points?.length > 0);
  
  // Combine all price histories into a format suitable for the chart
  const combinedPriceHistories = useMemo(() => {
    const individualSeries = safeQueries
      .filter(query => query.data?.points?.length > 0)
      .map(query => {
        const marketId = query.data!.marketId;
        const holding = holdings.find(h => h.market_id === marketId);
        
        return {
          id: marketId,
          name: holding?.market?.question || 'Market',
          color: colorMap.get(marketId) || '#3b82f6',
          data: query.data!.points,
          holding
        };
      });
      
    if (!showCumulativePnL || individualSeries.length <= 1) {
      return individualSeries;
    }
    
    // Calculate cumulative PnL series
    try {
      // Get the earliest and latest timestamps across all series
      let allTimestamps: number[] = [];
      individualSeries.forEach(series => {
        series.data.forEach(point => {
          allTimestamps.push(point.time);
        });
      });
      
      if (allTimestamps.length === 0) {
        return individualSeries;
      }
      
      const minTime = Math.min(...allTimestamps);
      const maxTime = Math.max(...allTimestamps);
      
      // Create a map of timestamps to prices for each series
      const seriesPriceMap = new Map<string, Map<number, number>>();
      individualSeries.forEach(series => {
        const priceMap = new Map<number, number>();
        series.data.forEach(point => {
          priceMap.set(point.time, point.price);
        });
        seriesPriceMap.set(series.id, priceMap);
      });
      
      // Calculate the total investment amount for weighting
      const totalInvestment = holdings.reduce((sum, h) => {
        const amount = h.amount || 0;
        const entryPrice = h.entry_price || 0;
        return sum + (amount * entryPrice);
      }, 0);
      
      if (totalInvestment <= 0) {
        // If there's no investment, just return individual series
        return individualSeries;
      }
      
      // Get all unique timestamps across all series
      const uniqueTimestamps = [...new Set(allTimestamps)].sort((a, b) => a - b);
      
      // Calculate weighted PnL at each timestamp
      const pnlData: { time: number; price: number }[] = [];
      
      uniqueTimestamps.forEach(timestamp => {
        let totalPnL = 0;
        
        holdings.forEach(holding => {
          const series = individualSeries.find(s => s.id === holding.market_id);
          if (!series) return;
          
          const priceMap = seriesPriceMap.get(series.id);
          if (!priceMap) return;
          
          // Find the closest timestamp in this series
          let closestTime = timestamp;
          let closestDiff = Infinity;
          
          for (const time of priceMap.keys()) {
            const diff = Math.abs(time - timestamp);
            if (diff < closestDiff) {
              closestDiff = diff;
              closestTime = time;
            }
          }
          
          const currentPrice = priceMap.get(closestTime) || 0;
          const entryPrice = holding.entry_price || 0;
          const amount = holding.amount || 0;
          const investment = amount * entryPrice;
          const weight = investment / totalInvestment;
          
          // Calculate PnL percentage
          const pnlPct = entryPrice > 0 ? ((currentPrice / 100) - entryPrice) / entryPrice : 0;
          
          // Add weighted contribution to total PnL
          totalPnL += pnlPct * weight * 100; // Convert back to percentage points for display
        });
        
        // Clamp the PnL to reasonable bounds and center at 50%
        // This prevents extreme values from breaking the chart
        const clampedPnL = Math.max(-80, Math.min(80, totalPnL)); // Clamp between -80% and +80%
        
        pnlData.push({
          time: timestamp,
          price: clampedPnL + 50 // Center at 50% for display purposes
        });
      });
      
      // Add the cumulative PnL series
      return [
        ...individualSeries,
        {
          id: 'cumulative-pnl',
          name: 'Cumulative PnL',
          color: '#f59e0b', // Amber color for the PnL line
          data: pnlData,
          isCumulativePnL: true
        }
      ];
    } catch (error) {
      console.error('Error calculating cumulative PnL:', error);
      return individualSeries;
    }
  }, [safeQueries, holdings, colorMap, showCumulativePnL]);

  // Fetch events for the first market only (if multiple are selected)
  // In the future, we could combine events from all markets
  const primaryMarketId = effectiveMarketIds[0];
  
  const { data: marketEvents = [] } = useQuery({
    queryKey: ['marketEvents', primaryMarketId],
    queryFn: async () => {
      if (!primaryMarketId) return [];
      
      try {
        const { data, error } = await supabase
          .from('market_events')
          .select('*')
          .eq('market_id', primaryMarketId)
          .order('timestamp', { ascending: true });

        if (error) {
          console.error('Market events error:', error);
          toast.error(`Failed to load market events: ${error.message}`);
          throw error;
        }

        return data.map(event => ({
          ...event,
          timestamp: new Date(event.timestamp).getTime()
        }));
      } catch (error) {
        console.error('Error fetching market events:', error);
        toast.error('Could not load market events. Please try again later.');
        throw error;
      }
    },
    enabled: !!primaryMarketId,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
  });

  const formatLastUpdated = (timestamp?: number) => {
    if (!timestamp) return null;
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  if (effectiveMarketIds.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        Select a holding to view its price history
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-muted-foreground">Price History for {effectiveQuestion}</div>
              {combinedPriceHistories.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-2">
                  {combinedPriceHistories.map(series => (
                    <div key={series.id} className="flex items-center gap-1">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: series.color }}
                      ></div>
                      <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {series.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {holdings.length > 1 && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="cumulative-pnl"
                  checked={showCumulativePnL}
                  onCheckedChange={setShowCumulativePnL}
                />
                <Label htmlFor="cumulative-pnl" className="text-sm">Cumulative PnL</Label>
              </div>
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : hasData ? (
          <PriceChart
            dataSeries={combinedPriceHistories}
            events={marketEvents}
            selectedInterval={selectedChartInterval}
            onIntervalSelect={setSelectedChartInterval}
          />
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No price history available
          </div>
        )}
      </div>
    </div>
  );
}
