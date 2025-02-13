
import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowRight, History } from 'lucide-react';

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentEvent = PLACEHOLDER_EVENTS[currentIndex];

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : PLACEHOLDER_EVENTS.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < PLACEHOLDER_EVENTS.length - 1 ? prev + 1 : 0));
  };

  return (
    <Card className="p-6 bg-card animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Similar Historical Events</h3>
      </div>

      <div className="relative">
        <button
          onClick={handlePrevious}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90 transition-colors"
          aria-label="Previous event"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <button
          onClick={handleNext}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90 transition-colors"
          aria-label="Next event"
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="mb-6 px-8">
          <div className="aspect-video relative rounded-lg overflow-hidden mb-4">
            <img
              src={currentEvent.image}
              alt={currentEvent.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <h4 className="text-white font-semibold">{currentEvent.title}</h4>
              <p className="text-white/80 text-sm">{currentEvent.date}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <h5 className="text-sm font-medium text-primary mb-2">Similarities</h5>
            <ScrollArea className="h-[200px] rounded-md border p-4">
              <ul className="space-y-2">
                {currentEvent.similarities.map((similarity, index) => (
                  <li key={index} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    • {similarity}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <h5 className="text-sm font-medium text-destructive mb-2">Differences</h5>
            <ScrollArea className="h-[200px] rounded-md border p-4">
              <ul className="space-y-2">
                {currentEvent.differences.map((difference, index) => (
                  <li key={index} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    • {difference}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>
      </div>
    </Card>
  );
}
