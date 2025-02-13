import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, History } from 'lucide-react';

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
        <div className="space-y-3">
          <div className="flex px-4">
            <div className="w-[180px]">Event</div>
            <div className="flex-1 grid grid-cols-2 gap-8">
              <span className="text-xs font-medium text-primary">Similarities</span>
              <span className="text-xs font-medium text-destructive">Differences</span>
            </div>
          </div>

          {EVENTS.map((event) => (
            <Collapsible
              key={event.id}
              open={openEvents.includes(event.id)}
              onOpenChange={() => toggleEvent(event.id)}
              className="border rounded-md bg-card"
            >
              <div className="flex">
                <CollapsibleTrigger className="w-[180px] flex items-center justify-between p-3 hover:bg-accent rounded-l-md text-sm">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{event.title}</span>
                    <span className="text-xs text-muted-foreground">{event.date}</span>
                  </div>
                  {openEvents.includes(event.id) ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>

                <div className="flex-1 grid grid-cols-2 gap-8 p-3">
                  <div className="text-sm text-muted-foreground">
                    <span className="line-clamp-1 pl-4 before:content-['•'] before:mr-2 before:text-primary">
                      {event.similarities[0]}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="line-clamp-1 pl-4 before:content-['•'] before:mr-2 before:text-destructive">
                      {event.differences[0]}
                    </span>
                  </div>
                </div>
              </div>

              <CollapsibleContent>
                <div className="border-t p-4">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                      {event.similarities.slice(1).map((item, index) => (
                        <div 
                          key={index} 
                          className="text-sm text-muted-foreground pl-4 before:content-['•'] before:mr-2 before:text-primary"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {event.differences.slice(1).map((item, index) => (
                        <div 
                          key={index} 
                          className="text-sm text-muted-foreground pl-4 before:content-['•'] before:mr-2 before:text-destructive"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
