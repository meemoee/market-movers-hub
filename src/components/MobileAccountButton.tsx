
import { Button } from "@/components/ui/button";
import { User, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileAccountDrawer } from "./MobileAccountDrawer";

export function MobileAccountButton() {
  const [session, setSession] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 right-4 z-50 rounded-full bg-background/80 backdrop-blur-sm border shadow-md"
        onClick={() => setIsDrawerOpen(true)}
      >
        {session ? <User className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
      </Button>
      
      <MobileAccountDrawer 
        open={isDrawerOpen} 
        onOpenChange={setIsDrawerOpen} 
      />
    </>
  );
}
