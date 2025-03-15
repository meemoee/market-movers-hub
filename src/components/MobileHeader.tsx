
import { Button } from "./ui/button";
import { Menu, UserCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import AccountIsland from "./AccountIsland";

interface MobileHeaderProps {
  toggleSidebar: () => void;
}

export default function MobileHeader({ toggleSidebar }: MobileHeaderProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between p-3 bg-background/80 backdrop-blur-sm border-b md:hidden">
      <Button 
        onClick={toggleSidebar} 
        variant="ghost" 
        size="icon" 
        className="h-9 w-9"
      >
        <Menu className="h-5 w-5" />
      </Button>
      
      <a href="/" className="flex-1 flex justify-center">
        <img 
          src="/hunchex-logo.svg" 
          alt="Hunchex" 
          className="h-8"
        />
      </a>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <UserCircle className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="p-0 pt-0 w-full sm:max-w-md">
          <AccountIsland />
        </SheetContent>
      </Sheet>
    </div>
  );
}
