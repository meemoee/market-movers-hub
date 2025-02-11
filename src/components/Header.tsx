import { Menu, Search } from "lucide-react";
import { Input } from "./ui/input";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");

  useEffect(() => {
    if (searchValue) {
      searchParams.set("search", searchValue);
    } else {
      searchParams.delete("search");
    }
    setSearchParams(searchParams);
  }, [searchValue, searchParams, setSearchParams]);

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-background border-b border-white/10 z-50">
      <div className="h-full">
        {/* Use the same container constraints as your main content */}
        <div className="flex container h-full items-center">
          <button 
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            onClick={onMenuClick}
          >
            <Menu size={20} />
          </button>

          <h1 className="text-xl font-bold ml-4">
            <span className="text-[#7E69AB]">hunch</span>
            <span className="text-[#D946EF]">ex</span>
          </h1>

          {/* Adjust the search bar container to match container padding */}
          <div className="flex-1 max-w-[800px] mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search markets..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full pl-9 bg-background"
              />
            </div>
          </div>

          {/* Optional: adjust or remove spacer if not needed */}
          <div className="w-[240px]" />
        </div>
      </div>
    </header>
  );
}
