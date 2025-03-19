
import { useState } from 'react';
import RightSidebar from "@/components/RightSidebar";
import TopMoversList from "@/components/TopMoversList";
import AccountIsland from "@/components/AccountIsland";
import MobileHeader from "@/components/MobileHeader";
import MobileDock from "@/components/MobileDock";
import { useIsMobile } from '@/hooks/use-mobile';
import { Glow } from "@/components/ui/glow";
import { Search } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { TopMoversHeader } from "@/components/market/TopMoversHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LiveAnalysisCard } from '@/components/market/research/LiveAnalysisCard';

const formatInterval = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes === 10080) return '1 week';
  return `${minutes / 1440} days`;
};

const TIME_INTERVALS = [
  { label: formatInterval(5), value: '5' },
  { label: formatInterval(10), value: '10' },
  { label: formatInterval(30), value: '30' },
  { label: formatInterval(60), value: '60' },
  { label: formatInterval(240), value: '240' },
  { label: formatInterval(480), value: '480' },
  { label: formatInterval(1440), value: '1440' },
  { label: formatInterval(10080), value: '10080' },
] as const;

export default function Index() {
  const [selectedInterval, setSelectedInterval] = useState<string>("1440");
  const [openMarketsOnly, setOpenMarketsOnly] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [probabilityRange, setProbabilityRange] = useState<[number, number]>([0, 100]);
  const [showMinThumb, setShowMinThumb] = useState(false);
  const [showMaxThumb, setShowMaxThumb] = useState(false);
  const [priceChangeRange, setPriceChangeRange] = useState<[number, number]>([-100, 100]);
  const [showPriceChangeMinThumb, setShowPriceChangeMinThumb] = useState(false);
  const [showPriceChangeMaxThumb, setShowPriceChangeMaxThumb] = useState(false);
  const [volumeRange, setVolumeRange] = useState<[number, number]>([0, 1000000]);
  const [showVolumeMinThumb, setShowVolumeMinThumb] = useState(false);
  const [showVolumeMaxThumb, setShowVolumeMaxThumb] = useState(false);
  const [sortBy, setSortBy] = useState<'price_change' | 'volume'>('price_change');
  const [showLiveAnalysis, setShowLiveAnalysis] = useState(false);
  const isMobile = useIsMobile();

  const handleIntervalChange = (newInterval: string) => {
    if (newInterval !== selectedInterval) {
      setSelectedInterval(newInterval);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="bg-background min-h-screen flex flex-col">
      {/* Purple Glow Effect */}
      <div className="fixed top-0 right-0 w-full h-full pointer-events-none z-0">
        <Glow 
          variant="top" 
          className={`opacity-30 scale-150 ${isMobile ? '' : 'translate-x-1/4'} -translate-y-1/4 blur-3xl`}
        />
      </div>
      
      {/* Mobile Header */}
      {isMobile && <MobileHeader toggleSidebar={toggleSidebar} />}
      
      <main className={`flex-1 flex flex-col ${isMobile ? 'pt-16 pb-20' : ''}`}>
        <div className="max-w-[1280px] mx-auto w-full relative flex flex-grow">
          {isMobile && isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-30"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* Mobile Sidebar */}
          <aside 
            className={`${
              isMobile 
                ? 'fixed left-0 top-0 bottom-0 z-40 w-[280px] bg-background'
                : 'hidden'
            } ${
              isMobile && !isSidebarOpen ? '-translate-x-full' : 'translate-x-0'
            } transition-transform duration-300 ease-in-out pt-14 overflow-y-auto`}
          >
            {/* Sidebar content */}
          </aside>

          {/* Desktop Account Island */}
          {!isMobile && (
            <div className="fixed z-[60] w-[280px]" style={{ 
              left: 'max(calc(50% - 640px + 16px), 16px)' /* Aligns with main content container */ 
            }}>
              {/* Logo */}
              <div className="text-left mb-10 pl-3 pt-2">
                <img src="/hunchex-logo.svg" alt="HunchEx" className="h-14" />
              </div>
              <AccountIsland context="desktop" />
            </div>
          )}

          {/* Main content area with proper margin to account for fixed AccountIsland */}
          <div className={`flex flex-col ${isMobile ? 'ml-0 max-w-full' : 'ml-[320px]'} xl:mr-[400px] max-w-[660px]`}>
            {/* Search and Fixed Header Section */}
            <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md shadow-md border-b border-white/5 w-full max-w-[660px] rounded-b-lg">
              {/* Search Bar */}
              <div className="flex items-center w-full px-4 py-3 border-b border-white/5">
                <div className="relative flex-1 max-w-2xl mx-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search markets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 bg-background"
                  />
                </div>
              </div>
              
              {/* Top Movers Header with Filters - This is sticky */}
              <TopMoversHeader
                timeIntervals={TIME_INTERVALS}
                selectedInterval={selectedInterval}
                onIntervalChange={handleIntervalChange}
                openMarketsOnly={openMarketsOnly}
                onOpenMarketsChange={setOpenMarketsOnly}
                isTimeIntervalDropdownOpen={isTimeIntervalDropdownOpen}
                setIsTimeIntervalDropdownOpen={setIsTimeIntervalDropdownOpen}
                probabilityRange={probabilityRange}
                setProbabilityRange={setProbabilityRange}
                showMinThumb={showMinThumb}
                setShowMinThumb={setShowMinThumb}
                showMaxThumb={showMaxThumb}
                setShowMaxThumb={setShowMaxThumb}
                priceChangeRange={priceChangeRange}
                setPriceChangeRange={setPriceChangeRange}
                showPriceChangeMinThumb={showPriceChangeMinThumb}
                setShowPriceChangeMinThumb={setShowPriceChangeMinThumb}
                showPriceChangeMaxThumb={showPriceChangeMaxThumb}
                setShowPriceChangeMaxThumb={setShowPriceChangeMaxThumb}
                volumeRange={volumeRange}
                setVolumeRange={setVolumeRange}
                showVolumeMinThumb={showVolumeMinThumb}
                setShowVolumeMinThumb={setShowVolumeMinThumb}
                showVolumeMaxThumb={showVolumeMaxThumb}
                setShowVolumeMaxThumb={setShowVolumeMaxThumb}
                sortBy={sortBy}
                onSortChange={setSortBy}
              />
            </div>
            
            {/* Scrollable Content Area */}
            <div className="flex-grow overflow-y-auto">
              <div className={`w-full ${isMobile ? 'px-0 max-w-full' : 'px-4'}`}>
                {/* Added Live Analysis Card here */}
                <div className="mt-4">
                  <LiveAnalysisCard 
                    description="Analyze content for market insights" 
                    maxHeight="400px" 
                  />
                </div>
                
                <TopMoversList
                  timeIntervals={TIME_INTERVALS}
                  selectedInterval={selectedInterval}
                  onIntervalChange={handleIntervalChange}
                  openMarketsOnly={openMarketsOnly}
                  onOpenMarketsChange={setOpenMarketsOnly}
                  searchQuery={searchQuery}
                  probabilityRange={probabilityRange}
                  showMinThumb={showMinThumb}
                  showMaxThumb={showMaxThumb}
                  priceChangeRange={priceChangeRange}
                  showPriceChangeMinThumb={showPriceChangeMinThumb}
                  showPriceChangeMaxThumb={showPriceChangeMaxThumb}
                  volumeRange={volumeRange}
                  showVolumeMinThumb={showVolumeMinThumb}
                  showVolumeMaxThumb={showVolumeMaxThumb}
                  sortBy={sortBy}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Dock */}
      {isMobile && <MobileDock />}

      <RightSidebar />
    </div>
  );
}
