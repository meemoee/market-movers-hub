import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

export default function RightSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 w-[400px] h-screen bg-background border-l border-white/10 transition-transform duration-300 z-10",
        isCollapsed && "translate-x-[360px]"
      )}
    >
      <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-l-lg rounded-r-none h-24 bg-background border border-white/10 border-r-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <ChevronLeft
            className={cn(
              "transition-transform",
              isCollapsed && "rotate-180"
            )}
          />
        </Button>
      </div>

      <div className="p-6">
        <h2 className="text-xl font-bold">Right Sidebar</h2>
      </div>
    </aside>
  );
}