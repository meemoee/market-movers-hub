import { Card } from "@/components/ui/card";
import { Market } from "@/types/market";

interface MarketCardProps {
  market: Market;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onBuy: () => void;
  onSell: () => void;
}

export function MarketCard({ market, isExpanded, onToggleExpand, onBuy, onSell }: MarketCardProps) {
  return (
    <Card className="w-full backdrop-blur-md bg-black/30 border border-white/10">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">{market.question}</h3>
        <button onClick={onToggleExpand}>
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {isExpanded && (
        <div className="mt-4">
          <p>Price: ${market.price.toFixed(2)}</p>
          <p>Change: {market.price_change.toFixed(2)}%</p>
          <p>Volume: {market.volume.toFixed(0)}</p>
          <div className="flex space-x-2 mt-2">
            <button onClick={onBuy} className="bg-green-500 text-white px-4 py-2 rounded">Buy</button>
            <button onClick={onSell} className="bg-red-500 text-white px-4 py-2 rounded">Sell</button>
          </div>
        </div>
      )}
    </Card>
  );
}
