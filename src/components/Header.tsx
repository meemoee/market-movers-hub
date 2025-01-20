import { Menu, Bell } from "lucide-react";

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-background border-b border-white/10 z-50 flex items-center">
      <div className="h-full w-full flex items-center justify-between px-4">
        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <Menu size={20} />
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
          Market Movers
        </h1>
        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <Bell size={20} />
        </button>
      </div>
    </header>
  );
}