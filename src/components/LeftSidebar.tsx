import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "./ui/button";

export default function LeftSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [balance, setBalance] = useState(1000); // Demo balance

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
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-2">Demo Account</h2>
            <p className="text-sm text-muted-foreground">user@example.com</p>
          </div>
          
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Balance</h3>
            <p className="text-2xl font-bold">${balance.toFixed(2)}</p>
          </div>

          <div className="space-y-2">
            <Button 
              onClick={() => setBalance(b => b + 100)}
              className="w-full"
              variant="outline"
            >
              Add $100
            </Button>
            <Button
              onClick={() => setBalance(b => Math.max(0, b - 100))}
              className="w-full"
              variant="outline"
            >
              Remove $100
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}