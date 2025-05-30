
import { useState, useEffect } from "react";
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { useNavigate } from "react-router-dom";
import { AccountAvatar } from "./account/AccountAvatar";
import { AccountBalance } from "./account/AccountBalance";
import { AccountHoldings } from "./account/AccountHoldings";
import { useIsMobile } from "@/hooks/use-mobile";
import AccountSettings from "./account/AccountSettings";
import { Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type AccountIslandContext = 'desktop' | 'mobile';

interface AccountIslandProps {
  context?: AccountIslandContext;
}

export default function AccountIsland({ context = 'desktop' }: AccountIslandProps) {
  const { user, session, isLoading, signOut } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  // If we're on mobile and this is a desktop context, or vice versa, don't render the content
  const shouldRender = (context === 'mobile' && isMobile) || (context === 'desktop' && !isMobile);

  useEffect(() => {
    if (!shouldRender || !session?.user) return;
    
    fetchUserProfile(session.user.id);
  }, [shouldRender, session]);

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
      setError(error.message);
    }
  };

  // Open settings modal
  const openSettings = () => {
    setShowSettings(true);
  };

  // Close settings modal
  const closeSettings = () => {
    setShowSettings(false);
  };

  // If we shouldn't render this context, return null
  if (!shouldRender) {
    return null;
  }

  // Show loading state if auth status is still being determined
  if (isLoading) {
    return (
      <Card className={`w-full ${isMobile ? 'rounded-md' : 'rounded-lg'} bg-transparent border-0 shadow-none`}>
        <div className={isMobile ? 'p-4' : 'p-6'}>
          <div className="animate-pulse flex flex-col space-y-4">
            <div className="h-10 bg-gray-700/50 rounded w-2/3"></div>
            <div className="h-8 bg-gray-700/50 rounded w-full"></div>
            <div className="h-8 bg-gray-700/50 rounded w-full"></div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${isMobile ? 'rounded-md' : 'rounded-lg'} bg-transparent border-0 shadow-none`}>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!session ? (
        <div className={isMobile ? 'p-4' : 'p-6'}>
          <Auth
            supabaseClient={supabase}
            appearance={{ 
              theme: ThemeSupa,
              style: {
                button: {
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                },
                anchor: {
                  color: 'hsl(var(--primary))',
                },
              },
            }}
            providers={['google']}
            theme="dark"
          />
        </div>
      ) : (
        <div className={`space-y-6 ${isMobile ? 'p-4' : 'p-6'}`}>
          <div className="flex items-start gap-4">
            <AccountAvatar email={session.user.email} />
            <div className="flex-1 min-w-0">
              <Link to="/profile" className="block hover:underline">
                <h2 className="text-xl font-bold mb-1">Account</h2>
                <p className="text-sm text-muted-foreground truncate overflow-hidden">{session.user.email}</p>
              </Link>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              className="ml-auto" 
              onClick={openSettings}
              title="Settings"
            >
              <Settings size={18} />
            </Button>
          </div>
          
          <AccountBalance 
            balance={balance}
            onAddBalance={() => setBalance(b => (b ?? 0) + 100)}
            onRemoveBalance={() => setBalance(b => Math.max(0, (b ?? 0) - 100))}
          />

          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Holdings</h3>
            <AccountHoldings />
          </div>

          <Button
            onClick={signOut}
            className="w-full"
            variant="destructive"
          >
            Sign Out
          </Button>
          
          <AccountSettings 
            isOpen={showSettings}
            onClose={closeSettings}
          />
        </div>
      )}
    </Card>
  );
}
