import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MarketDetails } from "./MarketDetails";

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

export function MarketCard({ market, isExpanded, onToggleExpand, onBuy, onSell }: MarketCardProps) {
  const isPositive = market.price_change >= 0;
  const changePercentage = market.price_change * 100;

  return (
    <div className="w-full">
      <div className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <h3 className="font-medium text-base">{market.question}</h3>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Price: </span>
                <span className="font-medium">{(market.price * 100).toFixed(1)}¢</span>
              </div>
              <div>
                <span className="text-muted-foreground">Change: </span>
                <span className={`font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}>
                  {isPositive ? "+" : ""}{changePercentage.toFixed(1)} pp
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Volume: </span>
                <span className="font-medium">${market.volume.toFixed(0)}</span>
              </div>
            </div>
          </div>

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

        {isExpanded && (
          <div className="mt-4">
            <MarketDetails
              market={market}
              onBuy={onBuy}
              onSell={onSell}
            />
          </div>
        )}
      </div>
      <Separator />
    </div>
  );
}