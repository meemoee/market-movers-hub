import { useState } from 'react';
import Header from "@/components/Header";
import LeftSidebar from "@/components/LeftSidebar";
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
  
  const { data, isLoading, error, isFetching } = useTopMovers(
    selectedInterval,
    openMarketsOnly,
    page
  );

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LeftSidebar />
      
      <main className="pt-20 px-4 lg:pl-[320px] lg:pr-[420px]">
        <div className="max-w-4xl mx-auto space-y-6 relative">
          <AccountIsland />
          <TopMoversList
            topMovers={data?.data || []}
            error={error?.message || null}
            timeIntervals={TIME_INTERVALS}
            selectedInterval={selectedInterval}
            onIntervalChange={setSelectedInterval}
            onLoadMore={handleLoadMore}
            hasMore={data?.hasMore || false}
            openMarketsOnly={openMarketsOnly}
            onOpenMarketsChange={setOpenMarketsOnly}
            isLoading={isLoading}
            isLoadingMore={isFetching && !isLoading}
          />
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}