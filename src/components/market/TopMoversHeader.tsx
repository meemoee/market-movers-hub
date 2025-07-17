
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { MultiRangeSlider } from '@/components/ui/multi-range-slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagFilter } from './TagFilter';

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
  priceChangeRange: [number, number];
  setPriceChangeRange: (range: [number, number]) => void;
  showPriceChangeMinThumb: boolean;
  setShowPriceChangeMinThumb: (show: boolean) => void;
  showPriceChangeMaxThumb: boolean;
  setShowPriceChangeMaxThumb: (show: boolean) => void;
  volumeRange: [number, number];
  setVolumeRange: (range: [number, number]) => void;
  showVolumeMinThumb: boolean;
  setShowVolumeMinThumb: (show: boolean) => void;
  showVolumeMaxThumb: boolean;
  setShowVolumeMaxThumb: (show: boolean) => void;
  sortBy: 'price_change' | 'volume';
  onSortChange: (value: 'price_change' | 'volume') => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
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
  priceChangeRange,
  setPriceChangeRange,
  showPriceChangeMinThumb,
  setShowPriceChangeMinThumb,
  showPriceChangeMaxThumb,
  setShowPriceChangeMaxThumb,
  volumeRange,
  setVolumeRange,
  showVolumeMinThumb,
  setShowVolumeMinThumb,
  showVolumeMaxThumb,
  setShowVolumeMaxThumb,
  sortBy,
  onSortChange,
  selectedTags,
  onTagsChange,
}: TopMoversHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <div className="p-4 w-full relative">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center flex-shrink-1">
          <h2 className={`${isMobile ? 'text-lg' : 'text-xl sm:text-2xl'} font-bold whitespace-nowrap mr-1`}>What happened in the last</h2>
          <div className="relative">
            <button
              onClick={() => setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full hover:bg-accent/20 transition-colors ${isMobile ? 'text-lg' : 'text-xl sm:text-2xl'} font-bold`}
            >
              <span>{timeIntervals.find(i => i.value === selectedInterval)?.label.replace('minutes', 'mins')}</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {isTimeIntervalDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 bg-black/80 backdrop-blur-sm border border-border rounded-lg shadow-xl z-50">
                {timeIntervals.map((interval) => (
                  <button
                    key={interval.value}
                    className={`w-full px-4 py-2 text-left hover:bg-accent/50 transition-colors ${isMobile ? 'text-lg' : 'text-xl sm:text-2xl'} font-bold whitespace-nowrap`}
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

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Tag Filter - Outside of dropdown for better UX */}
          <TagFilter
            selectedTags={selectedTags}
            onTagsChange={onTagsChange}
          />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent/20 transition-colors">
                <SlidersHorizontal className="w-4 h-4" />
                <span className="text-sm">Filters</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px] bg-background/95 backdrop-blur-sm border-border">
              <DropdownMenuLabel>Market Filters</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="p-2 space-y-1">
                <Label className="text-xs text-muted-foreground">Sort by</Label>
                <Select
                  value={sortBy}
                  onValueChange={(value: 'price_change' | 'volume') => onSortChange(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price_change">Price Change</SelectItem>
                    <SelectItem value="volume">Volume Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <div className="px-4 py-6 space-y-12">
                <div className="space-y-8">
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
                      className="w-full mb-4"
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
                    <div className="flex items-center gap-2">
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

                <div className="space-y-8">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="leading-6">Price Change Range</Label>
                      <output className="text-sm font-medium tabular-nums">
                        {showPriceChangeMinThumb ? priceChangeRange[0] : -100}% - {showPriceChangeMaxThumb ? priceChangeRange[1] : 100}%
                      </output>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex">
                        <div className="w-1/2 bg-red-500/20" />
                        <div className="w-1/2 bg-green-500/20" />
                      </div>
                      <MultiRangeSlider
                        min={-100}
                        max={100}
                        value={priceChangeRange}
                        onChange={setPriceChangeRange}
                        showMinThumb={showPriceChangeMinThumb}
                        showMaxThumb={showPriceChangeMaxThumb}
                        className="w-full relative z-10 mb-4"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="price-change-min-thumb"
                        checked={showPriceChangeMinThumb}
                        onCheckedChange={(checked) => {
                          setShowPriceChangeMinThumb(checked as boolean);
                          if (!checked) {
                            setPriceChangeRange([-100, priceChangeRange[1]]);
                          }
                        }}
                      />
                      <Label htmlFor="price-change-min-thumb" className="text-sm">Min</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="price-change-max-thumb"
                        checked={showPriceChangeMaxThumb}
                        onCheckedChange={(checked) => {
                          setShowPriceChangeMaxThumb(checked as boolean);
                          if (!checked) {
                            setPriceChangeRange([priceChangeRange[0], 100]);
                          }
                        }}
                      />
                      <Label htmlFor="price-change-max-thumb" className="text-sm">Max</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="leading-6">Total Volume Range</Label>
                      <output className="text-sm font-medium tabular-nums">
                        {showVolumeMinThumb ? volumeRange[0] : 0} - {showVolumeMaxThumb ? volumeRange[1] : 1000000}
                      </output>
                    </div>
                    <MultiRangeSlider
                      min={0}
                      max={1000000}
                      value={volumeRange}
                      onChange={setVolumeRange}
                      showMinThumb={showVolumeMinThumb}
                      showMaxThumb={showVolumeMaxThumb}
                      className="w-full mb-4"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="volume-min-thumb"
                        checked={showVolumeMinThumb}
                        onCheckedChange={(checked) => {
                          setShowVolumeMinThumb(checked as boolean);
                          if (!checked) {
                            setVolumeRange([0, volumeRange[1]]);
                          }
                        }}
                      />
                      <Label htmlFor="volume-min-thumb" className="text-sm">Min</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="volume-max-thumb"
                        checked={showVolumeMaxThumb}
                        onCheckedChange={(checked) => {
                          setShowVolumeMaxThumb(checked as boolean);
                          if (!checked) {
                            setVolumeRange([volumeRange[0], 1000000]);
                          }
                        }}
                      />
                      <Label htmlFor="volume-max-thumb" className="text-sm">Max</Label>
                    </div>
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
