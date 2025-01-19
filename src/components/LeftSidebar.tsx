import { useState } from "react";
import { ChevronLeft } from "lucide-react";

export default function LeftSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    </aside>
  );
}