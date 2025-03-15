
import { JobQueueResearchCard } from "./JobQueueResearchCard";
import { WebResearchCard } from "./WebResearchCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MarketDetailsProps {
  description?: string;
  marketId: string;
  question: string;
  selectedInterval: string;
  eventId?: string;
  bestBidPrice?: number;
  bestAskPrice?: number;
  outcomes?: string[];
}

export function MarketDetails({ 
  description, 
  marketId, 
  selectedInterval,
  eventId,
  bestBidPrice,
  bestAskPrice,
  outcomes
}: MarketDetailsProps) {
  return (
    <div className="w-full space-y-4 pt-2">
      <Tabs defaultValue="background" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="background" className="flex-1">Background Job Research</TabsTrigger>
          <TabsTrigger value="interactive" className="flex-1">Interactive Research</TabsTrigger>
        </TabsList>
        <TabsContent value="background" className="mt-2">
          <JobQueueResearchCard 
            description={description || ""} 
            marketId={marketId}
            bestBidPrice={bestBidPrice}
            bestAskPrice={bestAskPrice}
            outcomes={outcomes} 
          />
        </TabsContent>
        <TabsContent value="interactive" className="mt-2">
          <WebResearchCard 
            description={description || ""} 
            marketId={marketId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
