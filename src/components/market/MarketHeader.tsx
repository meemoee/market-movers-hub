import { Button } from "@/components/ui/button";

interface MarketHeaderProps {
  image: string;
  question: string;
  yesSubTitle?: string;
  onBuy: () => void;
  onSell: () => void;
}

export function MarketHeader({ image, question, yesSubTitle, onBuy, onSell }: MarketHeaderProps) {
  return (
    <div className="flex items-start gap-4">
      <img
        src={image}
        alt=""
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-base leading-tight">
          {question}
        </h3>
        {yesSubTitle && (
          <p className="text-sm text-muted-foreground mt-1">
            {yesSubTitle}
          </p>
        )}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBuy}
          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-medium px-3 py-1 h-7 text-sm"
        >
          Buy
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSell}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium px-3 py-1 h-7 text-sm"
        >
          Sell
        </Button>
      </div>
    </div>
  );
}