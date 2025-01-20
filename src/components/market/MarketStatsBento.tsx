import { DollarSign, TrendingUp, Users, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

function BentoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "relative h-full w-full overflow-hidden rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-4",
      className
    )}>
      {children}
    </div>
  );
}

export function MarketStatsBento() {
  return (
    <div className="w-full mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <BentoCard>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm font-medium">Total Volume</span>
            </div>
            <div className="text-2xl font-bold">$1.2M</div>
            <div className="text-xs text-muted-foreground mt-1">+12% from last week</div>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Active Markets</span>
            </div>
            <div className="text-2xl font-bold">245</div>
            <div className="text-xs text-muted-foreground mt-1">+5 new today</div>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Active Traders</span>
            </div>
            <div className="text-2xl font-bold">1,893</div>
            <div className="text-xs text-muted-foreground mt-1">+23% this month</div>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">Price Changes</span>
            </div>
            <div className="text-2xl font-bold">+31%</div>
            <div className="text-xs text-muted-foreground mt-1">Average daily movement</div>
          </div>
        </BentoCard>
      </div>
    </div>
  );
}