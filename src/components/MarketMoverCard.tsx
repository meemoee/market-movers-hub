import { Card } from "./ui/card";
import { ArrowUpCircle, ArrowDownCircle } from "lucide-react";

interface MarketMoverProps {
  title: string;
  price: number;
  change: number;
  volume: number;
}

export default function MarketMoverCard({ title, price, change, volume }: MarketMoverProps) {
  const isPositive = change >= 0;
  const changePercentage = change * 100; // Convert to percentage points
  
  return (
    <Card className="p-4 bg-card hover:bg-card/80 transition-colors cursor-pointer">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-sm line-clamp-2 flex-1">{title}</h3>
        {isPositive ? (
          <ArrowUpCircle className="text-[#32CD80] ml-2 flex-shrink-0" size={20} />
        ) : (
          <ArrowDownCircle className="text-[#CD327F] ml-2 flex-shrink-0" size={20} />
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
        <div>
          <p className="text-muted-foreground">Price</p>
          <p className="font-medium">{(price * 100).toFixed(1)}¢</p>
        </div>
        <div>
          <p className="text-muted-foreground">Change</p>
          <p className={`font-medium ${isPositive ? "text-[#32CD80]" : "text-[#CD327F]"}`}>
            {isPositive ? "+" : ""}{changePercentage.toFixed(1)} pp
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Volume</p>
          <p className="font-medium">${volume.toFixed(0)}</p>
        </div>
      </div>
    </Card>
  );
}