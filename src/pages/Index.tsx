import { useState, useEffect } from 'react';
import Header from "@/components/Header";
import RightSidebar from "@/components/RightSidebar";
import TopMoversList from "@/components/TopMoversList";
import AccountIsland from "@/components/AccountIsland";
import { useTopMovers } from '@/hooks/useTopMovers';

const TIME_INTERVALS = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
] as const;

export default function Index() {
  const [selectedInterval, setSelectedInterval] = useState<string>("24h");
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
      
      <main className="pt-20 px-4 lg:pr-[420px]">
        <div className="max-w-4xl mx-auto space-y-4 relative">
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="flex-1 w-full">
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
            <div className="w-full lg:w-auto lg:sticky lg:top-[200px]">
              <AccountIsland />
            </div>
          </div>
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}