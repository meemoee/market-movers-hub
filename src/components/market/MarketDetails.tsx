import { QADisplay } from "./QADisplay";
import { OrderBook } from "./OrderBook";
import PriceChart from "./PriceChart";
import { WebResearchCard } from "./WebResearchCard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      return data || [];
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
      return data || [];
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