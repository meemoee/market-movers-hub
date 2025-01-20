import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "../ui/card";

interface Holding {
  id: string;
  market_id: string;
  market: {
    question: string;
    image: string | null;
  } | null;
}

export function AccountHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHoldings();
  }, []);

  const fetchHoldings = async () => {
    try {
      const { data, error } = await supabase
        .from('holdings')
        .select(`
          id,
          market_id,
          market:markets (
            question,
            image
          )
        `);

      if (error) throw error;
      setHoldings(data || []);
    } catch (error) {
      console.error('Error fetching holdings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading holdings...</div>;
  }

  if (holdings.length === 0) {
    return <div className="text-sm text-muted-foreground">No holdings yet</div>;
  }

  return (
    <div className="space-y-3">
      {holdings.map((holding) => (
        <Card key={holding.id} className="p-3 flex items-start gap-3">
          {holding.market?.image && (
            <img
              src={holding.market.image}
              alt=""
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm line-clamp-2">
              {holding.market?.question || 'Unknown Market'}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}