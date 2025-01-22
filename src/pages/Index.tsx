import { useState, useEffect } from 'react';
import Header from "@/components/Header";
import RightSidebar from "@/components/RightSidebar";
import TopMoversList from "@/components/TopMoversList";
import AccountIsland from "@/components/AccountIsland";
import { useTopMovers } from '@/hooks/useTopMovers';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const [page, setPage] = useState(1);
  const [allMovers, setAllMovers] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  
  const { data, isLoading, error, isFetching } = useTopMovers(
    selectedInterval,
    openMarketsOnly,
    page
  );

  useEffect(() => {
    setPage(1);
    setAllMovers([]);
  }, [selectedInterval, openMarketsOnly]);

  useEffect(() => {
    if (data?.data) {
      if (page === 1) {
        setAllMovers(data.data);
      } else {
        setAllMovers(prev => [...prev, ...data.data]);
      }
    }
  }, [data?.data, page]);

  const handleIntervalChange = (newInterval: string) => {
    if (newInterval !== selectedInterval) {
      setSelectedInterval(newInterval);
    }
  };

  const handleLoadMore = () => {
    if (!isFetching) {
      setPage(prev => prev + 1);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={toggleSidebar} />
      
      <main className="container mx-auto pt-14 xl:pr-[400px] px-0 sm:px-4">
        <div className="relative flex max-w-[1280px] mx-auto">
          {isMobile && isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          <aside 
            className={`${
              isMobile 
                ? 'fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-background transition-transform duration-300 pt-14'
                : 'w-[260px] relative'
            } ${
              isMobile && !isSidebarOpen ? '-translate-x-full' : 'translate-x-0'
            }`}
          >
            <div className={isMobile ? 'h-full overflow-y-auto' : 'sticky top-[72px]'}>
              <AccountIsland />
            </div>
          </aside>

          <div className={`flex-1 min-w-0 min-h-screen ${isMobile ? 'w-full' : 'ml-6'}`}>
            <TopMoversList
              topMovers={allMovers}
              error={error?.message || null}
              timeIntervals={TIME_INTERVALS}
              selectedInterval={selectedInterval}
              onIntervalChange={handleIntervalChange}
              onLoadMore={handleLoadMore}
              hasMore={data?.hasMore || false}
              openMarketsOnly={openMarketsOnly}
              onOpenMarketsChange={setOpenMarketsOnly}
              isLoading={isLoading && page === 1}
              isLoadingMore={isFetching && page > 1}
            />
          </div>
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}