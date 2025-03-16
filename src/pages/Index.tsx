
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Purple Glow Effect */}
      <div className="fixed top-0 right-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <Glow 
          variant="top" 
          className={`opacity-30 scale-150 ${isMobile ? '' : 'translate-x-1/4'} -translate-y-1/4 blur-3xl`}
        />
      </div>
      
      {/* Mobile Header */}
      {isMobile && <MobileHeader toggleSidebar={toggleSidebar} />}
      
      <div className={`${isMobile ? 'pt-14' : 'pt-4'} flex justify-center w-full min-h-screen relative z-10`}>
        {/* Main Content Container - Centers both AccountIsland and TopMoversList together */}
        <div className="flex w-full max-w-[1280px] mx-auto">
          {/* Left Sidebar - AccountIsland - Not Mobile */}
          {!isMobile && (
            <div className="w-[280px] flex-shrink-0">
              <div className="sticky top-4 h-[calc(100vh-2rem)]">
                <AccountIsland />
              </div>
            </div>
          )}
          
          {/* Mobile Sidebar - slides in from left */}
          {isMobile && (
            <>
              {isSidebarOpen && (
                <div 
                  className="fixed inset-0 bg-black/50 z-40"
                  onClick={() => setIsSidebarOpen(false)}
                />
              )}

              <aside 
                className={`fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-background
                  ${isMobile && !isSidebarOpen ? '-translate-x-full' : 'translate-x-0'}
                  transition-transform duration-300 ease-in-out flex flex-col`}
              >
                <div className="h-full pt-14 overflow-y-auto">
                  <div className="p-4">
                    <AccountIsland />
                  </div>
                </div>
              </aside>
            </>
          )}
          
          {/* Main Content Area - TopMoversList */}
          <main className="flex-1 px-4 max-w-[800px]">
            <TopMoversList
              timeIntervals={TIME_INTERVALS}
              selectedInterval={selectedInterval}
              onIntervalChange={handleIntervalChange}
              openMarketsOnly={openMarketsOnly}
              onOpenMarketsChange={setOpenMarketsOnly}
            />
          </main>
        </div>
        
        {/* Right Sidebar - Fixed position outside the central content */}
        {!isMobile && (
          <aside className="fixed right-0 top-0 w-[400px] h-screen">
            <div className="sticky top-0 h-screen">
              <RightSidebar />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
