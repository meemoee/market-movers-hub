import { useEffect, useState } from "react";
import AccountIsland from "@/components/AccountIsland";
import { AccountHoldings, Holding } from "@/components/account/AccountHoldings";
import { AccountBalance } from "@/components/account/AccountBalance";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import MobileHeader from "@/components/MobileHeader";
import MobileDock from "@/components/MobileDock";
import { useIsMobile } from "@/hooks/use-mobile";
import { Glow } from "@/components/ui/glow";
import RightSidebar from "@/components/RightSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { PriceHistoryView } from "@/components/account/PriceHistoryView";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export default function Profile() {
  const { user, session, isLoading } = useAuth();
  const [selectedHoldings, setSelectedHoldings] = useState<Holding[]>([]);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Fetch user balance with proper caching
  const { data: balance, isLoading: isBalanceLoading } = useQuery({
    queryKey: ['userBalance', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        return data.balance;
      } catch (error: any) {
        console.error('Error fetching profile:', error);
        toast.error('Could not load your balance. Please try again later.');
        return null;
      }
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: false,
    staleTime: 60000, // 1 minute
    gcTime: 300000    // 5 minutes
  });

  useEffect(() => {
    if (isLoading) return; // Wait until auth state is determined
    
    if (!session?.user) {
      // Redirect to home if not logged in
      navigate('/');
    }
  }, [navigate, session, isLoading]);

  const handleSelectHolding = (holding: Holding) => {
    setSelectedHoldings(prevSelected => {
      // Check if the holding is already selected
      const existingIndex = prevSelected.findIndex(h => h.id === holding.id);
      
      if (existingIndex >= 0) {
        // If already selected, remove it (toggle off)
        return prevSelected.filter(h => h.id !== holding.id);
      } else {
        // If not selected, add it to the array
        return [...prevSelected, holding];
      }
    });
  };

  const handleAddBalance = async () => {
    if (!user?.id) return;
    
    try {
      const newBalance = (balance || 0) + 100;
      await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', user.id);
    } catch (error) {
      console.error('Error updating balance:', error);
      toast.error('Could not update your balance. Please try again later.');
    }
  };

  const handleRemoveBalance = async () => {
    if (!user?.id) return;
    
    try {
      const newBalance = Math.max(0, (balance || 0) - 100);
      await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', user.id);
    } catch (error) {
      console.error('Error updating balance:', error);
      toast.error('Could not update your balance. Please try again later.');
    }
  };

  // If still loading or no session, show a loading state
  if (isLoading || !session) {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex flex-col space-y-4 items-center">
          <div className="h-12 bg-gray-700/50 rounded w-48"></div>
          <div className="h-8 bg-gray-700/50 rounded w-64"></div>
        </div>
      </div>
    );
  }

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
      {isMobile && <MobileHeader toggleSidebar={() => {}} />}
      
      <main className={`flex-1 flex flex-col ${isMobile ? 'pt-16 pb-20' : ''}`}>
        <div className="max-w-[1280px] mx-auto w-full relative flex flex-grow">
          {/* Desktop Account Island */}
          {!isMobile && (
            <div className="fixed z-[60] w-[280px]" style={{ 
              left: 'max(calc(50% - 640px + 16px), 16px)' /* Aligns with main content container */ 
            }}>
              {/* Logo with Link */}
              <div className="text-left mb-10 pl-3 pt-2">
                <Link to="/" className="block hover:opacity-80 transition-opacity">
                  <img src="/hunchex-logo.svg" alt="HunchEx" className="h-14" />
                </Link>
              </div>
              <AccountIsland context="desktop" />
            </div>
          )}

          {/* Main content area with proper margin to account for fixed AccountIsland */}
          <div className={`flex flex-col ${isMobile ? 'ml-0 max-w-full' : 'ml-[320px]'} xl:mr-[400px] max-w-[660px]`}>
            <div className="max-w-[1280px] mx-auto w-full px-4 py-8 relative flex flex-col items-center">
              <h1 className="text-3xl font-bold mb-8">User Profile</h1>
              
              <div className="w-full max-w-3xl">
                {session && (
                  <div className="space-y-8">
                    <Card className="p-6">
                      <h2 className="text-2xl font-semibold mb-4">Account Information</h2>
                      <p className="text-muted-foreground mb-2">Email: {session.user.email}</p>
                    </Card>
                    
                    <Card className="p-6">
                      <h2 className="text-2xl font-semibold mb-4">Balance</h2>
                      <AccountBalance 
                        balance={balance}
                        onAddBalance={handleAddBalance}
                        onRemoveBalance={handleRemoveBalance}
                      />
                    </Card>

                    {selectedHoldings.length > 0 && (
                      <Card className="p-6">
                        <h2 className="text-2xl font-semibold mb-4">Price History</h2>
                        <div className="mb-4">
                          <p className="text-sm text-muted-foreground">
                            {selectedHoldings.length === 1 
                              ? "Showing price history for 1 holding" 
                              : `Showing price history for ${selectedHoldings.length} holdings`}
                          </p>
                          {selectedHoldings.length > 1 && (
                            <button 
                              onClick={() => setSelectedHoldings([])}
                              className="text-sm text-primary hover:underline mt-1"
                            >
                              Clear all selections
                            </button>
                          )}
                        </div>
                        <PriceHistoryView 
                          holdings={selectedHoldings}
                        />
                      </Card>
                    )}

                    <Card className="p-6">
                      <h2 className="text-2xl font-semibold mb-4">Your Holdings</h2>
                      <AccountHoldings 
                        onSelectHolding={handleSelectHolding} 
                        selectedHoldingIds={selectedHoldings.map(h => h.id)}
                      />
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Dock */}
      {isMobile && <MobileDock />}

      {/* Right Sidebar */}
      <RightSidebar />
    </div>
  );
}