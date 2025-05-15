
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistoricalEvents, HistoricalEvent } from '@/hooks/useHistoricalEvents';
import { History } from "lucide-react";

interface SimilarHistoricalEventsProps {
  marketId?: string;
}

export function SimilarHistoricalEvents({ marketId }: SimilarHistoricalEventsProps) {
  const { historicalEvents, isLoading } = useHistoricalEvents(marketId);

  return (
    <Card className="p-6 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Similar Historical Events</h3>
      </div>
      <ScrollArea className="max-h-[400px]">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : historicalEvents.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {historicalEvents.map((event: HistoricalEvent) => (
              <AccordionItem key={event.id} value={event.id} className="border-0">
                <AccordionTrigger className="px-4 py-2 rounded-lg hover:bg-accent/50 [&[data-state=open]>div]:pb-2 transition-colors">
                  <div className="flex items-center gap-3 w-full">
                    <img 
                      src={event.image_url} 
                      alt={event.title}
                      width={32}
                      height={32}
                      className="w-8 h-8 object-cover rounded" 
                    />
                    <div>
                      <p className="font-semibold">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.date}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-2 overflow-hidden">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-sm font-medium text-primary mb-2">Similarities</h5>
                      <ul className="space-y-1">
                        {event.similarities.map((similarity, index) => (
                          <li key={index} className="text-sm text-muted-foreground">• {similarity}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-sm font-medium text-destructive mb-2">Differences</h5>
                      <ul className="space-y-1">
                        {event.differences.map((difference, index) => (
                          <li key={index} className="text-sm text-muted-foreground">• {difference}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No similar historical events found
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
