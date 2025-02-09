import { ChevronDown } from 'lucide-react';
import { Card } from '../ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

interface TimeInterval {
  label: string;
  value: string;
}

interface TopMoversHeaderProps {
  timeIntervals: readonly TimeInterval[];
  selectedInterval: string;
  onIntervalChange: (interval: string) => void;
  openMarketsOnly: boolean;
  onOpenMarketsChange: (value: boolean) => void;
  isTimeIntervalDropdownOpen: boolean;
  setIsTimeIntervalDropdownOpen: (value: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function TopMoversHeader({
  timeIntervals,
  selectedInterval,
  onIntervalChange,
  openMarketsOnly,
  onOpenMarketsChange,
  isTimeIntervalDropdownOpen,
  setIsTimeIntervalDropdownOpen,
  searchQuery,
  onSearchChange,
}: TopMoversHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <div className="sticky top-14 z-40 w-full">
      <Card className="rounded-t-none border-t-0 bg-card/95 backdrop-blur-supports-backdrop-blur:bg-card/95 backdrop-blur-supports-backdrop-blur:backdrop-blur-sm p-4 w-full relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-4">
          <div className="flex items-center flex-wrap gap-4">
            <h2 className="text-xl sm:text-2xl font-bold whitespace-nowrap">
              What happened in the last
            </h2>
            <div className="relative -ml-1">
              <button
                onClick={() =>
                  setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)
                }
                className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-accent/20 transition-colors text-xl sm:text-2xl font-bold"
              >
                <span>
                  {timeIntervals
                    .find((i) => i.value === selectedInterval)
                    ?.label.replace('minutes', 'mins')}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {isTimeIntervalDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-transparent backdrop-blur-sm border border-border rounded-lg shadow-xl z-50">
                  {timeIntervals.map((interval) => (
                    <button
                      key={interval.value}
                      className="w-full px-4 py-2 text-left hover:bg-accent/50 transition-colors text-xl sm:text-2xl font-bold whitespace-nowrap"
                      onClick={() => {
                        setIsTimeIntervalDropdownOpen(false);
                        onIntervalChange(interval.value);
                      }}
                    >
                      {interval.label.replace('minutes', 'mins')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* NEW: Search Input */}
            <div className="flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search top movers..."
                className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 shrink-0">
            <input
              type="checkbox"
              checked={openMarketsOnly}
              onChange={(e) => onOpenMarketsChange(e.target.checked)}
              className="rounded border-border bg-transparent"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Open Markets Only
            </span>
          </label>
        </div>
      </Card>
    </div>
  );
}
