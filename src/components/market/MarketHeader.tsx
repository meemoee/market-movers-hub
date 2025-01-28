import { HoverButton } from "@/components/ui/hover-button";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MarketHeaderProps {
  image: string;
  question: string;
  yesSubTitle?: string;
  bestBid?: number;
  bestAsk?: number;
  onBuy: (outcome: number) => void;
  onSell: (outcome: number) => void;
  outcomes?: string[];
  onToggleExpand: () => void;
}

export function MarketHeader({ 
  image, 
  question, 
  yesSubTitle, 
  bestBid,
  bestAsk,
  onBuy, 
  onSell,
  outcomes = ["Yes", "No"],
  onToggleExpand
}: MarketHeaderProps) {
  const truncateOutcome = (outcome: string) => {
    return outcome.length > 8 ? `${outcome.slice(0, 6)}...` : outcome;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <img
          src={image}
          alt=""
          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
        />
        <div 
          className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity py-1.5"
          onClick={onToggleExpand}
        >
          <h3 className="font-medium text-base leading-tight">
            {question}
          </h3>
          {yesSubTitle && (
            <p className="text-sm text-muted-foreground mt-1">
              {yesSubTitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex w-full sm:w-auto gap-2 h-12">
        {[0, 1].map((index) => (
          <DropdownMenu key={index}>
            <DropdownMenuTrigger asChild>
              <HoverButton
                variant={index === 0 ? "buy" : "sell"}
                className="flex-1 sm:flex-initial flex flex-col items-center justify-center"
              >
                <span className="text-xs truncate max-w-[80px]">{truncateOutcome(outcomes[index])}</span>
                {index === 0 ? (
                  bestAsk !== undefined && (
                    <span className="text-[11px] font-medium opacity-90">
                      {(bestAsk * 100).toFixed(1)}¢
                    </span>
                  )
                ) : (
                  bestBid !== undefined && (
                    <span className="text-[11px] font-medium opacity-90">
                      {(bestBid * 100).toFixed(1)}¢
                    </span>
                  )
                )}
                <ChevronDown className="h-3 w-3 ml-1" />
              </HoverButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onBuy(index)}>
                Buy {outcomes[index]}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSell(index)}>
                Sell {outcomes[index]}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </div>
    </div>
  );
}