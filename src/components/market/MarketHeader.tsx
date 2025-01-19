import { Button } from "@/components/ui/button";

interface MarketHeaderProps {
  image: string;
  question: string;
  yesSubTitle?: string;
  bestBid?: number;
  bestAsk?: number;
  onBuy: () => void;
  onSell: () => void;
}

export function MarketHeader({ 
  image, 
  question, 
  yesSubTitle, 
  bestBid,
  bestAsk,
  onBuy, 
  onSell 
}: MarketHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <img
        src={image}
        alt=""
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0 my-auto">
        <h3 className="font-medium text-base leading-tight">
          {question}
        </h3>
        {yesSubTitle && (
          <p className="text-sm text-muted-foreground mt-1">
            {yesSubTitle}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 relative h-[72px] min-w-[140px]">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-500/20 to-red-500/20" />
        <div className="relative h-full flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBuy}
            className="flex-1 h-full rounded-r-none border-r border-border/50 hover:bg-emerald-500/20 text-emerald-600 font-medium flex flex-col items-center justify-center gap-1"
          >
            <span>Buy</span>
            {bestAsk !== undefined && (
              <span className="text-[11px] font-normal opacity-80">
                {(bestAsk * 100).toFixed(1)}¢
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSell}
            className="flex-1 h-full rounded-l-none hover:bg-red-500/20 text-red-600 font-medium flex flex-col items-center justify-center gap-1"
          >
            <span>Sell</span>
            {bestBid !== undefined && (
              <span className="text-[11px] font-normal opacity-80">
                {(bestBid * 100).toFixed(1)}¢
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}