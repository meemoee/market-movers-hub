import { ChevronDown } from 'lucide-react';
import { Card } from '../ui/card';

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
}

export function TopMoversHeader({
  timeIntervals,
  selectedInterval,
  onIntervalChange,
  openMarketsOnly,
  onOpenMarketsChange,
  isTimeIntervalDropdownOpen,
  setIsTimeIntervalDropdownOpen,
}: TopMoversHeaderProps) {
  return (
    <div className="sticky top-14 z-40 w-full max-w-2xl mx-auto">
      <Card className="rounded-t-none border-t-0 bg-card/95 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Market Movers</h2>
            <div className="relative">
              <button
                onClick={() => setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/50 hover:bg-accent/70 transition-colors"
              >
                <span>{timeIntervals.find(i => i.value === selectedInterval)?.label}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {isTimeIntervalDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-xl z-50">
                  {timeIntervals.map((interval) => (
                    <button
                      key={interval.value}
                      className={`w-full px-4 py-2 text-left hover:bg-accent/50 transition-colors ${
                        selectedInterval === interval.value ? 'bg-accent/30' : ''
                      }`}
                      onClick={() => {
                        setIsTimeIntervalDropdownOpen(false);
                        onIntervalChange(interval.value);
                      }}
                    >
                      {interval.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={openMarketsOnly}
              onChange={e => onOpenMarketsChange(e.target.checked)}
              className="rounded border-border bg-transparent"
            />
            <span className="text-sm text-muted-foreground">Open Markets Only</span>
          </label>
        </div>
      </Card>
    </div>
  );
}