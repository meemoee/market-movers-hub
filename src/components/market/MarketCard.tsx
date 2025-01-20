import { ChevronDown } from 'lucide-react';
import { Card } from '../ui/card';
import { MarketHeader } from './MarketHeader';
import { MarketStats } from './MarketStats';
import { MarketDetails } from './MarketDetails';

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
          image={market.image}
          question={market.question}
          yesSubTitle={market.yes_sub_title}
          bestBid={market.final_best_bid}
          bestAsk={market.final_best_ask}
          onBuy={onBuy}
          onSell={onSell}
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
      </div>

      <div
        className={`overflow-hidden transition-all duration-500 ease-out ${
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-4 pt-0">
          <MarketDetails description={market.description || ''} />
        </div>
      </div>
    </Card>
  );
}