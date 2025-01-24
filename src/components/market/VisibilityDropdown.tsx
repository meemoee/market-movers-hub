import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VisibilityDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

export function VisibilityDropdown({ value, onChange }: VisibilityDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => setIsOpen(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  return (
    <Select
      value={value}
      onValueChange={onChange}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <SelectTrigger className="h-7 text-xs px-3 bg-[#E5DEFF] hover:bg-[#D6BCFA] border-0 rounded-full w-[100px] text-[#403E43]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent 
        position="popper" 
        className="w-[100px] min-w-[100px]"
        align="end"
      >
        <SelectItem value="everyone">Everyone</SelectItem>
        <SelectItem value="followers">Followers</SelectItem>
        <SelectItem value="tier1">Tier 1</SelectItem>
        <SelectItem value="tier2">Tier 2</SelectItem>
        <SelectItem value="tier3">Tier 3</SelectItem>
      </SelectContent>
    </Select>
  );
}