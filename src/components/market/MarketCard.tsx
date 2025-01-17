import { Card } from "@/components/ui/card";
import { MarketHeader } from "./MarketHeader";
import { MarketStats } from "./MarketStats";
import { MarketDetails } from "./MarketDetails";

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
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200">
      <div className="p-4 space-y-4">
        <MarketHeader
          image={market.image}
          question={market.question}
          yesSubTitle={market.yes_sub_title}
          onBuy={onBuy}
          onSell={onSell}
        />
        
        <MarketStats
          lastTradedPrice={market.final_last_traded_price}
          priceChange={market.price_change}
          volume={market.volume}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
        />

        {isExpanded && (
          <MarketDetails
            description={market.description}
            bestBid={market.final_best_bid}
            bestAsk={market.final_best_ask}
          />
        )}
      </div>
    </Card>
  );
}