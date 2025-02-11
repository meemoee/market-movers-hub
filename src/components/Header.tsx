
import { Menu, Bell, Search } from "lucide-react";
import { Input } from "./ui/input";

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-background border-b border-white/10 z-50">
      <div className="container mx-auto h-full flex items-center gap-4">
        <button 
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          onClick={onMenuClick}
        >
          <Menu size={20} />
        </button>

        <h1 className="text-xl font-bold">
          <span className="text-[#7E69AB]">hunch</span>
          <span className="text-[#D946EF]">ex</span>
        </h1>

        <div className="flex-1 max-w-xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search markets..."
              className="w-full pl-10 bg-accent/10 border-accent/20"
            />
          </div>
        </div>

        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <Bell size={20} />
        </button>
      </div>
    </header>
  );
}
