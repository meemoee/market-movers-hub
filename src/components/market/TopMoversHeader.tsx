
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { MultiRangeSlider } from '@/components/ui/multi-range-slider';
import { Checkbox } from '@/components/ui/checkbox';

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
  probabilityRange: [number, number];
  setProbabilityRange: (range: [number, number]) => void;
  showMinThumb: boolean;
  setShowMinThumb: (show: boolean) => void;
  showMaxThumb: boolean;
  setShowMaxThumb: (show: boolean) => void;
}

export function TopMoversHeader({
  timeIntervals,
  selectedInterval,
  onIntervalChange,
  openMarketsOnly,
  onOpenMarketsChange,
  isTimeIntervalDropdownOpen,
  setIsTimeIntervalDropdownOpen,
  probabilityRange,
  setProbabilityRange,
  showMinThumb,
  setShowMinThumb,
  showMaxThumb,
  setShowMaxThumb,
}: TopMoversHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <div className="p-4 w-full relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-4">
        <div className="flex items-center flex-wrap">
          <h2 className="text-xl sm:text-2xl font-bold whitespace-nowrap">What happened in the last</h2>
          <div className="relative -ml-1">
            <button
              onClick={() => setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-accent/20 transition-colors text-xl sm:text-2xl font-bold"
            >
              <span>{timeIntervals.find(i => i.value === selectedInterval)?.label.replace('minutes', 'mins')}</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {isTimeIntervalDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 bg-black/80 backdrop-blur-sm border border-border rounded-lg shadow-xl z-50">
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
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/20 transition-colors">
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-sm">Filters</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[300px] bg-background/95 backdrop-blur-sm border-border">
            <DropdownMenuLabel>Market Filters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => onOpenMarketsChange(!openMarketsOnly)}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={openMarketsOnly}
                  onChange={(e) => onOpenMarketsChange(e.target.checked)}
                  className="rounded border-border bg-transparent"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-sm">Open Markets Only</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-4 py-6 space-y-8">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="leading-6">Probability Range</Label>
                  <output className="text-sm font-medium tabular-nums">
                    {showMinThumb ? probabilityRange[0] : 0}% - {showMaxThumb ? probabilityRange[1] : 100}%
                  </output>
                </div>
                <MultiRangeSlider
                  min={0}
                  max={100}
                  value={probabilityRange}
                  onChange={setProbabilityRange}
                  showMinThumb={showMinThumb}
                  showMaxThumb={showMaxThumb}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="min-thumb"
                    checked={showMinThumb}
                    onCheckedChange={(checked) => {
                      setShowMinThumb(checked as boolean);
                      if (!checked) {
                        setProbabilityRange([0, probabilityRange[1]]);
                      }
                    }}
                  />
                  <Label htmlFor="min-thumb" className="text-sm">Min</Label>
                </div>
                <div className="flex items-center gap-4">
                  <Checkbox 
                    id="max-thumb"
                    checked={showMaxThumb}
                    onCheckedChange={(checked) => {
                      setShowMaxThumb(checked as boolean);
                      if (!checked) {
                        setProbabilityRange([probabilityRange[0], 100]);
                      }
                    }}
                  />
                  <Label htmlFor="max-thumb" className="text-sm">Max</Label>
                </div>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
