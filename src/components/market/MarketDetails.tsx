import { QADisplay } from "./QADisplay";
import { OrderBook } from "./OrderBook";
import PriceChart from "./PriceChart";
import { WebResearchCard } from "./WebResearchCard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PriceData, MarketEvent } from './chart/types';

interface MarketDetailsProps {
  description?: string;
  marketId: string;
  question: string;
}

export function MarketDetails({
  description,
  marketId,
  question,
}: MarketDetailsProps) {
  const { data: priceData = [] } = useQuery({
    queryKey: ['market-prices', marketId],
    queryFn: async () => {
      const { data } = await supabase
        .from('market_prices')
        .select('*')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: true });
      
      // Transform the data to match PriceData type
      return (data || []).map(d => ({
        time: new Date(d.timestamp).getTime(),
        price: d.last_traded_price || 0
      }));
    }
  });

  const { data: events = [] } = useQuery({
    queryKey: ['market-events', marketId],
    queryFn: async () => {
      const { data } = await supabase
        .from('market_events')
        .select('*')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: true });
      
      // Transform the data to match MarketEvent type
      return (data || []).map(d => ({
        id: d.id,
        event_type: d.event_type,
        title: d.title,
        description: d.description,
        timestamp: new Date(d.timestamp).getTime(),
        icon: d.icon
      }));
    }
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PriceChart 
          marketId={marketId} 
          data={priceData}
          events={events}
          selectedInterval="1d"
        />
        <OrderBook marketId={marketId} />
      </div>
      
      {description && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
            {description}
          </div>
          <WebResearchCard description={description} />
        </div>
      )}

      <QADisplay marketId={marketId} marketQuestion={question} />
    </div>
  );
}