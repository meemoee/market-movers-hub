import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "./ui/button";
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "./ui/alert";
import { useNavigate } from "react-router-dom";

export default function LeftSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setBalance(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/');
    } catch (error: any) {
      console.error('Error signing out:', error);
      setError(error.message);
    }
  };

  return (
    <aside 
      className={`fixed top-14 left-0 h-[calc(100vh-56px)] bg-background/70 backdrop-blur-md z-40 
        border-r border-white/10 transition-all duration-300 hidden lg:block
        ${isCollapsed ? "w-[50px]" : "w-[300px]"}`}
    >
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="p-2 hover:bg-white/10 w-full flex justify-center mt-4"
      >
        <ChevronLeft className={`transform transition-transform ${isCollapsed ? "rotate-180" : ""}`} />
      </button>
      
      {!isCollapsed && (
        <div className="p-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!session ? (
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
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-2">Account</h2>
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
              </div>
              
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Balance</h3>
                <p className="text-2xl font-bold">${balance?.toFixed(2) ?? '0.00'}</p>
              </div>

              <div className="space-y-2">
                <Button 
                  onClick={() => setBalance(b => (b ?? 0) + 100)}
                  className="w-full"
                  variant="outline"
                >
                  Add $100
                </Button>
                <Button
                  onClick={() => setBalance(b => Math.max(0, (b ?? 0) - 100))}
                  className="w-full"
                  variant="outline"
                >
                  Remove $100
                </Button>
                <Button
                  onClick={handleSignOut}
                  className="w-full"
                  variant="destructive"
                >
                  Sign Out
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}