
import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, History } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  date: string;
  similarities: string[];
  differences: string[];
}

const EVENTS: Event[] = [
  {
    id: '1',
    title: 'Tech Bubble Burst',
    date: 'March 2000',
    similarities: [
      'Rapid market valuation increase',
      'High investor speculation',
      'New technology sector growth',
      'Market sentiment driven',
      'Global economic impact'
    ],
    differences: [
      'Different technological context',
      'More mature market regulations',
      'Different global economic conditions',
      'Varied investor demographics',
      'Different market structure'
    ]
  },
  {
    id: '2',
    title: 'Financial Crisis',
    date: 'September 2008',
    similarities: [
      'Systemic risk concerns',
      'Market confidence issues',
      'Global market impact',
      'Policy intervention needed',
      'Institutional involvement'
    ],
    differences: [
      'Different root causes',
      'Varied regulatory framework',
      'Different market participants',
      'Alternative resolution mechanisms',
      'Unique economic context'
    ]
  },
  {
    id: '3',
    title: 'Black Monday',
    date: 'October 1987',
    similarities: [
      'Sudden market decline',
      'Global market panic',
      'Technical trading impact',
      'Regulatory response',
      'Recovery pattern'
    ],
    differences: [
      'Different market structure',
      'Trading technology differences',
      'Regulatory environment',
      'Market participants',
      'Global connectivity'
    ]
  }
];

export function SimilarHistoricalEvents() {
  const [openEvents, setOpenEvents] = useState<string[]>([]);

  const toggleEvent = (id: string) => {
    setOpenEvents(current => 
      current.includes(id) 
        ? current.filter(item => item !== id)
        : [...current, id]
    );
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Similar Historical Events</h3>
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-4">
          {EVENTS.map((event) => (
            <Collapsible
              key={event.id}
              open={openEvents.includes(event.id)}
              onOpenChange={() => toggleEvent(event.id)}
            >
              <div className="border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                <CollapsibleTrigger className="w-full text-left">
                  <div className="p-4 pb-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{event.title}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          {event.date}
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openEvents.includes(event.id) ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </CollapsibleTrigger>

                <div className="p-4 pt-0">
                  <div className="flex">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0"/>
                        <span className="text-xs font-medium text-primary">Similarities</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary mt-[6px] shrink-0"/>
                          <p className="text-sm text-muted-foreground">{event.similarities[0]}</p>
                        </div>
                        <CollapsibleContent>
                          {event.similarities.slice(1).map((similarity, index) => (
                            <div key={index} className="flex items-start gap-2">
                              <div className="h-2 w-2 rounded-full bg-primary mt-[6px] shrink-0"/>
                              <p className="text-sm text-muted-foreground">
                                {similarity}
                              </p>
                            </div>
                          ))}
                        </CollapsibleContent>
                      </div>
                    </div>
                    
                    <Separator orientation="vertical" className="mx-6" />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-destructive shrink-0"/>
                        <span className="text-xs font-medium text-destructive">Differences</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="h-2 w-2 rounded-full bg-destructive mt-[6px] shrink-0"/>
                          <p className="text-sm text-muted-foreground">{event.differences[0]}</p>
                        </div>
                        <CollapsibleContent>
                          {event.differences.slice(1).map((difference, index) => (
                            <div key={index} className="flex items-start gap-2">
                              <div className="h-2 w-2 rounded-full bg-destructive mt-[6px] shrink-0"/>
                              <p className="text-sm text-muted-foreground">
                                {difference}
                              </p>
                            </div>
                          ))}
                        </CollapsibleContent>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
