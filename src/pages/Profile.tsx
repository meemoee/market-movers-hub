
import { useEffect, useState } from "react";
import AccountIsland from "@/components/AccountIsland";
import { AccountHoldings } from "@/components/account/AccountHoldings";
import { AccountBalance } from "@/components/account/AccountBalance";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import MobileHeader from "@/components/MobileHeader";
import MobileDock from "@/components/MobileDock";
import { useIsMobile } from "@/hooks/use-mobile";
import { Glow } from "@/components/ui/glow";
import RightSidebar from "@/components/RightSidebar";

export default function Profile() {
  const [session, setSession] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Redirect to home if not logged in
        navigate('/');
        return;
      }
      
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
    });
  }, [navigate]);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setBalance(data.balance);
    } catch (error: any) {
      console.error('Error fetching profile:', error);
    }
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
      {isMobile && <MobileHeader toggleSidebar={() => {}} />}
      
      <main className={`flex-1 flex flex-col ${isMobile ? 'pt-16 pb-20' : ''}`}>
        <div className="max-w-[1280px] mx-auto w-full relative flex flex-grow">
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
                        onAddBalance={() => setBalance(b => (b ?? 0) + 100)}
                        onRemoveBalance={() => setBalance(b => Math.max(0, (b ?? 0) - 100))}
                      />
                    </Card>

                    <Card className="p-6">
                      <h2 className="text-2xl font-semibold mb-4">Your Holdings</h2>
                      <ScrollArea className="h-[500px]">
                        <AccountHoldings />
                      </ScrollArea>
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
