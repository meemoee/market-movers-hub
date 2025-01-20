import { DollarSign, TrendingUp, Users } from "lucide-react";
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left side - tall card */}
        <BentoCard className="md:row-span-2">
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm font-medium">Total Volume</span>
            </div>
            <div className="text-4xl font-bold mt-auto">$1.2M</div>
            <div className="text-sm text-muted-foreground mt-2">
              <span className="text-emerald-500">↑ 12%</span> from last week
            </div>
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="text-sm text-muted-foreground">Monthly trend</div>
              <div className="flex items-end justify-between mt-2 h-24">
                {[30, 45, 25, 60, 75, 45, 65].map((height, i) => (
                  <div key={i} className="w-[8%] bg-primary/20 rounded-t">
                    <div 
                      className="bg-primary rounded-t transition-all duration-500"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BentoCard>

        {/* Right side - two cards */}
        <BentoCard>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Active Markets</span>
            </div>
            <div className="text-2xl font-bold">245</div>
            <div className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-500">+5</span> new today
            </div>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Active Traders</span>
            </div>
            <div className="text-2xl font-bold">1,893</div>
            <div className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-500">+23%</span> this month
            </div>
          </div>
        </BentoCard>
      </div>
    </div>
  );
}