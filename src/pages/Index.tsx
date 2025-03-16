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
    <div className="bg-background overflow-x-hidden">
      {/* Purple Glow Effect - adjust positioning for mobile */}
      <div className="fixed top-0 right-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <Glow 
          variant="top" 
          className={`opacity-30 scale-150 ${isMobile ? '' : 'translate-x-1/4'} -translate-y-1/4 blur-3xl`}
        />
      </div>
      
      {/* Mobile Header */}
      {isMobile && <MobileHeader toggleSidebar={toggleSidebar} />}
      
      <main className={`mx-auto ${isMobile ? 'px-0 pr-0 pt-14' : 'px-4'} relative z-10 overflow-x-hidden`}>
        <div className="flex justify-center max-w-[1280px] mx-auto">
          {isMobile && isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* Mobile Sidebar */}
          <aside 
            className={`${
              isMobile 
                ? 'fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-background'
                : 'hidden'
            } ${
              isMobile && !isSidebarOpen ? '-translate-x-full' : 'translate-x-0'
            } transition-transform duration-300 ease-in-out`}
          >
            <div className="h-full overflow-y-auto pt-14">
              {isMobile && <AccountIsland />}
            </div>
          </aside>

          {/* Main Content with AccountIsland and TopMoversList */}
          <div className="flex w-full max-w-[1280px] gap-6 xl:pr-[400px]">
            {/* AccountIsland - Desktop Only */}
            {!isMobile && (
              <div className="w-[280px] shrink-0">
                <div className="sticky top-[102px]">
                  <AccountIsland />
                </div>
              </div>
            )}

            {/* TopMoversList */}
            <div className="flex-1 min-w-0 overflow-x-hidden">
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
