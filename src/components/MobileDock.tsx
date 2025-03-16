
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import AccountIsland from "./AccountIsland";
import { Home, Search, UserCircle, BarChart2, Menu } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";

export default function MobileDock() {
  const navigate = useNavigate();
  const { marketId } = useParams();
  const [activeTab, setActiveTab] = useState<string>("home");

  // Set the active tab based on the current route
  useEffect(() => {
    if (marketId) {
      setActiveTab("market");
    } else {
      setActiveTab("home");
    }
  }, [marketId]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-white/5 flex justify-around py-2 px-1 md:hidden">
      <Button 
        variant="ghost" 
        size="icon" 
        className={`h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 ${activeTab === "home" ? "text-primary" : "text-muted-foreground"}`}
        onClick={() => {
          navigate("/");
          setActiveTab("home");
        }}
      >
        <Home className="h-5 w-5" />
        <span className="text-[10px]">Home</span>
      </Button>

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 text-muted-foreground"
      >
        <Search className="h-5 w-5" />
        <span className="text-[10px]">Discover</span>
      </Button>

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 text-muted-foreground"
      >
        <BarChart2 className="h-5 w-5" />
        <span className="text-[10px]">Charts</span>
      </Button>

      <Sheet>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 text-muted-foreground"
          >
            <UserCircle className="h-5 w-5" />
            <span className="text-[10px]">Account</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="p-0 pt-0 w-full sm:max-w-md">
          <AccountIsland context="mobile" />
        </SheetContent>
      </Sheet>

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 text-muted-foreground"
      >
        <Menu className="h-5 w-5" />
        <span className="text-[10px]">More</span>
      </Button>
    </div>
  );
}
