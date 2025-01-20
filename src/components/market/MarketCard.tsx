import { Card } from "../ui/card";
import { MarketStats } from "./MarketStats";
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";
import { Button } from "../ui/button";

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

export function MarketCard({
  market,
  isExpanded,
  onToggleExpand,
  onBuy,
  onSell,
}: MarketCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <MarketHeader
          question={market.question}
          image={market.image}
          yesSubTitle={market.yes_sub_title}
        />

        <div className="mt-4">
          <MarketStats
            price={market.final_last_traded_price}
            priceChange={market.price_change}
            volume={market.volume}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            onClick={onBuy}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600"
          >
            Buy
          </Button>
          <Button
            onClick={onSell}
            variant="destructive"
            className="flex-1"
          >
            Sell
          </Button>
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-500 ease-out ${
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-4 pt-0">
          <MarketDetails
            description={market.description || ''}
            bestBid={market.final_best_bid}
            bestAsk={market.final_best_ask}
            marketId={market.market_id}
          />
        </div>
      </div>
    </Card>
  );
}