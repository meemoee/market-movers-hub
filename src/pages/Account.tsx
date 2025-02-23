
import { useState } from 'react';
import RightSidebar from "@/components/RightSidebar";
import AccountIsland from "@/components/AccountIsland";
import { useIsMobile } from '@/hooks/use-mobile';
import { Glow } from "@/components/ui/glow";
import { AccountActivityList } from "@/components/AccountActivityList";
import { useParams } from "react-router-dom";

export default function Account() {
  const { userId } = useParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Purple Glow Effect */}
      <div className="fixed top-0 right-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <Glow 
          variant="top" 
          className="opacity-30 scale-150 translate-x-1/4 -translate-y-1/4 blur-3xl"
        />
      </div>
      
      <main className="container mx-auto xl:pr-[400px] px-4 relative z-10">
        <div className="relative flex max-w-[1280px] mx-auto justify-center">
          {isMobile && isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          <aside 
            className={`${
              isMobile 
                ? 'fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-background'
                : 'w-[280px] relative'
            } ${
              isMobile && !isSidebarOpen ? '-translate-x-full' : 'translate-x-0'
            }`}
          >
            <div className={`${isMobile ? 'h-full overflow-y-auto' : 'sticky top-0 h-screen pt-3 overflow-y-auto'}`}>
              <div className="ml-6 mb-3">
                <a href="/" className="inline-block">
                  <img 
                    src="/hunchex-logo.svg" 
                    alt="Hunchex" 
                    className="h-12 hover:opacity-80 transition-opacity"
                  />
                </a>
              </div>
              <AccountIsland />
            </div>
          </aside>

          <div className={`flex-1 min-w-0 min-h-screen`}>
            <AccountActivityList userId={userId} />
          </div>
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}
