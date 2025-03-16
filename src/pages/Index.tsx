
import { useState } from 'react';
import RightSidebar from "@/components/RightSidebar";
import TopMoversList from "@/components/TopMoversList";
import AccountIsland from "@/components/AccountIsland";
import MobileHeader from "@/components/MobileHeader";
import { useIsMobile } from '@/hooks/use-mobile';
import { Glow } from "@/components/ui/glow";

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
      <div className="fixed top-0 right-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <Glow 
          variant="top" 
          className={`opacity-30 scale-150 ${isMobile ? '' : 'translate-x-1/4'} -translate-y-1/4 blur-3xl`}
        />
      </div>
      
      {/* Mobile Header */}
      {isMobile && <MobileHeader toggleSidebar={toggleSidebar} />}
      
      <main className={`flex-1 relative z-10 ${isMobile ? 'pt-16 pb-60' : ''} overflow-auto`}>
        <div className="max-w-[1280px] mx-auto relative">
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
          <div className={`flex-grow ${isMobile ? 'ml-0 max-w-full' : 'ml-[320px]'} xl:mr-[400px]`}>
            <div className={`w-full ${isMobile ? 'mt-3 px-0' : 'px-4'}`}>
              <TopMoversList
                timeIntervals={TIME_INTERVALS}
                selectedInterval={selectedInterval}
                onIntervalChange={handleIntervalChange}
                openMarketsOnly={openMarketsOnly}
                onOpenMarketsChange={setOpenMarketsOnly}
              />
            </div>
          </div>
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}
