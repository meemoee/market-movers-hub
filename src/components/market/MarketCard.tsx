import { useState } from "react";
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";
import { MarketStats } from "./MarketStats";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Market {
  market_id: string;
  question: string;
  price: number;
  price_change: number;
  volume: number;
  image: string;
  yes_sub_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  description?: string;
  outcomes?: string[];
}

interface MarketCardProps {
  market: Market;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onBuy: () => void;
  onSell: () => void;
}

export function MarketCard({
  market,
  isExpanded,
  onToggleExpand,
  onBuy,
  onSell,
}: MarketCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerateAnalysis = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: { marketId: market.market_id }
      });

      if (error) throw error;

      toast({
        title: "Analysis Generated",
        description: "The market analysis tree has been generated successfully.",
      });
    } catch (error) {
      console.error('Error generating analysis:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate market analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full rounded-lg bg-card border border-border p-3 space-y-3">
      <MarketHeader
        image={market.image}
        question={market.question}
        yesSubTitle={market.yes_sub_title}
        bestBid={market.final_best_bid}
        bestAsk={market.final_best_ask}
        onBuy={onBuy}
        onSell={onSell}
        outcomes={market.outcomes}
        onToggleExpand={onToggleExpand}
      />
      <div className="flex items-center justify-between">
        <MarketStats
          lastTradedPrice={market.final_last_traded_price}
          priceChange={market.price_change}
          volume={market.volume}
          isExpanded={isExpanded}
        />
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleGenerateAnalysis}
          disabled={isGenerating}
          className="ml-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Generate Analysis'
          )}
        </Button>
      </div>
      {isExpanded && market.description && (
        <MarketDetails
          description={market.description}
          bestBid={market.final_best_bid}
          bestAsk={market.final_best_ask}
          marketId={market.market_id}
        />
      )}
    </div>
  );
}