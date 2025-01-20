import { HoverButton } from "@/components/ui/hover-button";

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
      <div className="flex-shrink-0 relative h-8 min-w-[140px]">
        <div className="absolute inset-0 rounded-md bg-gradient-to-r from-emerald-500/20 to-red-500/20" />
        <div className="relative h-full flex">
          <HoverButton
            variant="buy"
            onClick={onBuy}
            className="flex-1 h-full rounded-r-none flex flex-col items-center justify-center gap-0 px-3"
          >
            <span className="text-xs">Buy</span>
            {bestAsk !== undefined && (
              <span className="text-[11px] font-medium opacity-90 -mt-0.5 text-emerald-500">
                {(bestAsk * 100).toFixed(1)}¢
              </span>
            )}
          </HoverButton>
          <HoverButton
            variant="sell"
            onClick={onSell}
            className="flex-1 h-full rounded-l-none flex flex-col items-center justify-center gap-0 px-3"
          >
            <span className="text-xs">Sell</span>
            {bestBid !== undefined && (
              <span className="text-[11px] font-medium opacity-90 -mt-0.5 text-red-500">
                {(bestBid * 100).toFixed(1)}¢
              </span>
            )}
          </HoverButton>
        </div>
      </div>
    </div>
  );
}