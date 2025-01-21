import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Brain } from "lucide-react";
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";
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
  onSell,
}: MarketCardProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateAnalysis = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please sign in to generate market analysis",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch('/api/generate-qa-tree', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          marketId: market.market_id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate analysis');
      }

      const data = await response.json();
      toast({
        title: "Analysis Generated",
        description: "Your market analysis tree has been created successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate market analysis",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="w-full bg-card hover:bg-card/80 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <MarketHeader
            question={market.question}
            price={market.price}
            priceChange={market.price_change}
            volume={market.volume}
            image={market.image}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAnalysis}
              disabled={isGenerating}
            >
              <Brain className="w-4 h-4 mr-2" />
              {isGenerating ? 'Analyzing...' : 'Analyze'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleExpand}
              className="shrink-0"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {isExpanded && (
          <MarketDetails
            description={market.description}
            outcomes={market.outcomes}
            yesSubTitle={market.yes_sub_title}
            lastTradedPrice={market.final_last_traded_price}
            bestAsk={market.final_best_ask}
            bestBid={market.final_best_bid}
            onBuy={onBuy}
            onSell={onSell}
          />
        )}
      </div>
    </Card>
  );
}