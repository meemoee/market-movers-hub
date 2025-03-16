
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
      
      <a href="/" className="flex-1 flex justify-center items-center">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 1788 638.6" 
          className="h-14 hover:opacity-80 transition-opacity"
          fill="currentColor"
        >
          <path d="m72.96,398.76v-209.29c0-7.07,5.59-13.12,12.83-13.12h20.4c7.24,0,12.83,6.06,12.83,13.12v74.02c10.85-15.14,26.97-25.91,49.34-25.91,33.22,0,61.84,25.24,61.84,71.33v89.84c0,7.4-5.59,13.12-12.83,13.12h-20.72c-6.91,0-12.83-5.72-12.83-13.12v-79.41c0-16.82-11.51-34.32-30.92-34.32s-33.88,15.14-33.88,42.4v71.33c0,7.4-5.59,13.12-12.83,13.12h-20.4c-7.24,0-12.83-5.72-12.83-13.12Z"/>
          <path d="m263.42,345.93v-89.84c0-7.4,5.92-13.12,12.83-13.12h20.72c6.91,0,12.83,5.72,12.83,13.12v79.07c0,17.16,10.53,34.66,30.92,34.66,19.08,0,33.88-15.14,33.88-42.4v-71.33c0-7.4,5.59-13.12,12.83-13.12h20.39c7.24,0,13.16,5.72,13.16,13.12v142.66c0,7.4-5.92,13.12-13.16,13.12h-20.39c-7.24,0-12.83-5.72-12.83-13.12v-5.38c-10.2,14.13-25.33,23.89-46.71,23.89-33.22,0-64.47-25.24-64.47-71.33Z"/>
          <path d="m453.88,398.76v-142.66c0-7.4,5.59-13.12,12.83-13.12h20.4c7.24,0,13.16,5.72,13.16,13.12v7.4c10.86-15.14,26.97-25.91,49.01-25.91,33.55,0,61.84,25.24,61.84,71.33v89.84c0,7.4-5.59,13.12-12.83,13.12h-20.39c-7.24,0-12.83-5.72-12.83-13.12v-79.41c0-16.82-11.84-34.32-30.92-34.32s-33.88,15.14-33.88,42.4v71.33c0,7.4-5.92,13.12-13.16,13.12h-20.4c-7.24,0-12.83-5.72-12.83-13.12Z"/>
          <path d="m637.75,319.01c3.95-45.42,41.45-80.75,86.18-81.43,26.65-.34,49.67,11.44,65.46,30.62,4.93,6.06,3.29,15.48-3.29,19.52l-19.74,12.11c-4.28,2.69-9.87,1.68-12.83-2.02-6.91-7.74-16.78-12.79-28.62-12.79-24.01,0-43.42,21.2-41.12,46.43,1.97,21.87,21.05,39.03,42.76,38.36,10.86-.34,20.4-5.38,26.97-13.12,3.29-3.7,8.55-4.37,12.83-1.68l19.74,12.11c6.91,4.37,8.22,13.79,2.96,19.85-15.46,18.51-38.16,30.28-64.15,30.28-50.99,0-92.11-45.09-87.17-98.25Z"/>
          <path d="m815.39,398.76v-209.29c0-7.07,5.59-13.12,12.83-13.12h20.4c7.24,0,12.83,6.06,12.83,13.12v74.02c10.85-15.14,26.97-25.91,49.34-25.91,33.22,0,61.84,25.24,61.84,71.33v89.84c0,7.4-5.59,13.12-12.83,13.12h-20.72c-6.91,0-12.83-5.72-12.83-13.12v-79.41c0-16.82-11.51-34.32-30.92-34.32s-33.88,15.14-33.88,42.4v71.33c0,7.4-5.59,13.12-12.83,13.12h-20.4c-7.24,0-12.83-5.72-12.83-13.12Z"/>
          <path d="m999.27,326.75c.33-49.8,42.43-90.85,91.12-89.17,46.71,2.02,79.28,41.39,79.28,89.84,0,2.36,0,5.05-.33,7.4-.66,7.07-5.92,12.45-12.83,12.45h-107.57c5.92,16.15,20.4,27.59,45.4,27.59,14.15,0,25-5.72,31.91-11.1,3.95-3.36,9.54-3.03,13.16.67l12.17,11.1c5.26,5.05,5.59,13.8.33,18.84-14.8,14.47-34.87,22.88-57.57,22.88-57.24,0-95.4-40.71-95.07-90.51Zm87.83-44.41c-20.72,0-34.54,13.46-39.47,30.62h76.65c-4.28-18.51-17.76-30.62-37.17-30.62Z"/>
          <path d="m1183.8,395.73l46.71-71.67-42.11-64.94c-4.6-7.07.33-16.15,8.55-16.15h23.68c5.26,0,9.87,2.36,12.83,7.07l23.36,36,23.68-36c2.63-4.71,7.57-7.07,12.83-7.07h23.68c8.22,0,13.16,9.08,8.55,16.15l-42.43,64.94,47.04,71.67c4.61,6.73-.33,16.15-8.55,16.15h-25.66c-5.26,0-9.87-2.69-12.83-7.07l-26.32-40.04-25.99,40.04c-2.96,4.37-7.9,7.07-12.83,7.07h-25.66c-8.22,0-13.16-9.42-8.55-16.15Z"/>
        </svg>
      </a>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <UserCircle className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="p-0 pt-0 w-full sm:max-w-md">
          <AccountIsland context="mobile" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
