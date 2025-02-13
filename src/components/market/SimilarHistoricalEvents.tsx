
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { History } from "lucide-react";

interface HistoricalEvent {
  id: string;
  title: string;
  date: string;
  image: string;
  similarities: string[];
  differences: string[];
}

const PLACEHOLDER_EVENTS: HistoricalEvent[] = [
  {
    id: '1',
    title: 'Tech Bubble (2000)',
    date: 'March 2000',
    image: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81',
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
    title: 'Financial Crisis (2008)',
    date: 'September 2008',
    image: 'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7',
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
  }
];

export function SimilarHistoricalEvents() {
  return (
    <Card className="p-6 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Similar Historical Events</h3>
      </div>
      <ScrollArea className="max-h-[400px]">
        <Accordion type="single" collapsible className="w-full">
          {PLACEHOLDER_EVENTS.map((event) => (
            <AccordionItem key={event.id} value={event.id} className="border-0">
              <AccordionTrigger className="px-4 py-2 rounded-lg hover:bg-accent/50 [&[data-state=open]>div]:pb-2 transition-colors">
                <div className="flex items-center gap-3 w-full">
                  <img 
                    src={event.image} 
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
              <AccordionContent className="px-4 pb-2">
                <div className="grid grid-cols-2 gap-4 relative">
                  <div>
                    <h5 className="text-sm font-medium text-primary mb-2">Similarities</h5>
                    <ul className="space-y-1">
                      {event.similarities.map((similarity, index) => (
                        <li key={index} className="text-sm text-muted-foreground">• {similarity}</li>
                      ))}
                    </ul>
                  </div>
                  <Separator orientation="vertical" className="absolute left-1/2 h-full -mx-2" />
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
      </ScrollArea>
    </Card>
  );
}
