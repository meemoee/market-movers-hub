import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from "@/lib/utils";
import { MarketHeader } from './MarketHeader';
import { MarketDetails } from './MarketDetails';
import { Button } from '../ui/button';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface MarketCardProps {
  market: {
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
  };
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
  onSell
}: MarketCardProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: { 
          marketId: market.market_id,
          maxDepth: 2,
          nodesPerLayer: 2
        }
      });

      if (error) throw error;

      toast({
        title: "Analysis Generated",
        description: "The market analysis has been generated successfully.",
      });

    } catch (error) {
      console.error('Error generating analysis:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to generate market analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className={cn(
      "w-full bg-card rounded-lg border transition-all duration-200",
      isExpanded ? "border-primary" : "border-border/50 hover:border-border"
    )}>
      <div 
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        <MarketHeader
          question={market.question}
          price={market.final_last_traded_price}
          priceChange={market.price_change}
          volume={market.volume}
          image={market.image}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleAnalyze();
            }}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? "Analyzing..." : "Analyze"}
          </Button>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0">
          <MarketDetails
            description={market.description || ''}
            outcomes={market.outcomes || ["Yes", "No"]}
            yesSubTitle={market.yes_sub_title || ''}
            lastTradedPrice={market.final_last_traded_price}
            bestAsk={market.final_best_ask}
            bestBid={market.final_best_bid}
            onBuy={onBuy}
            onSell={onSell}
          />
        </div>
      )}
    </div>
  );
}