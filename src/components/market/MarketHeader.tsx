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
    <div className="flex gap-4 justify-between">
      <div className="flex gap-4 flex-1 min-w-0">
        <img
          src={image}
          alt=""
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg leading-tight">
            {question}
          </h3>
          {yesSubTitle && (
            <p className="text-sm text-muted-foreground mt-1">
              {yesSubTitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="default"
          size="sm"
          className="bg-green-500 hover:bg-green-600"
          onClick={onBuy}
        >
          Buy
        </Button>
        <Button
          variant="default"
          size="sm"
          className="bg-red-500 hover:bg-red-600"
          onClick={onSell}
        >
          Sell
        </Button>
      </div>
    </div>
  );
}