import { useState, useEffect } from 'react';
import Header from "@/components/Header";
import RightSidebar from "@/components/RightSidebar";
import TopMoversList from "@/components/TopMoversList";
import AccountIsland from "@/components/AccountIsland";
import { useTopMovers } from '@/hooks/useTopMovers';

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
  
  const { data, isLoading, error, isFetching } = useTopMovers(
    selectedInterval,
    openMarketsOnly,
    page
  );

  useEffect(() => {
    if (data?.data && page === 1) {
      setAllMovers(data.data);
    } else if (data?.data && page > 1) {
      setAllMovers(prev => [...prev, ...data.data]);
    }
  }, [data?.data, page]);

  useEffect(() => {
    setPage(1);
    setAllMovers([]);
  }, [selectedInterval, openMarketsOnly]);

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto pt-14 lg:pr-[420px]">
        <div className="relative flex max-w-[1200px] mx-auto">
          {/* Left sidebar with AccountIsland */}
          <aside className="w-[260px] relative">
            <div className="sticky top-[72px]">
              <AccountIsland />
            </div>
          </aside>

          {/* Main content area with TopMoversList */}
          <div className="flex-1 min-w-0">
            <TopMoversList
              topMovers={allMovers}
              error={error?.message || null}
              timeIntervals={TIME_INTERVALS}
              selectedInterval={selectedInterval}
              onIntervalChange={setSelectedInterval}
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