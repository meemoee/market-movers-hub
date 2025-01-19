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

export default function AccountIsland() {
  const [session, setSession] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
    });

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
    <Card className="w-[400px] p-6 sticky top-[102px]">
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
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <AccountAvatar email={session.user.email} />
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-1">Account</h2>
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            </div>
          </div>
          
          <AccountBalance 
            balance={balance}
            onAddBalance={() => setBalance(b => (b ?? 0) + 100)}
            onRemoveBalance={() => setBalance(b => Math.max(0, (b ?? 0) - 100))}
          />

          <Button
            onClick={handleSignOut}
            className="w-full"
            variant="destructive"
          >
            Sign Out
          </Button>
        </div>
      )}
    </Card>
  );
}