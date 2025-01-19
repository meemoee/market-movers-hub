import { useState } from "react";
import { Card } from "@/components/ui/card";
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";
import { ChevronDown, ChevronUp } from "lucide-react";

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
}

interface MarketCardProps {
  market: Market;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onBuy: () => void;
  onSell: () => void;
}

export function MarketCard({ market, isExpanded, onToggleExpand, onBuy, onSell }: MarketCardProps) {
  return (
    <Card className="w-full bg-card hover:bg-card/80 transition-colors cursor-pointer">
      <div className="p-4" onClick={onToggleExpand}>
        <MarketHeader
          image={market.image}
          question={market.question}
          yesSubTitle={market.yes_sub_title}
          bestBid={market.final_best_bid}
          bestAsk={market.final_best_ask}
          onBuy={onBuy}
          onSell={onSell}
        />
        {isExpanded && (
          <div className="mt-4">
            <MarketDetails
              price={market.final_last_traded_price}
              priceChange={market.price_change}
              volume={market.volume}
              description={market.description}
            />
          </div>
        )}
      </div>
      <div className="px-4 py-2 border-t border-border flex justify-center">
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </Card>
  );
}