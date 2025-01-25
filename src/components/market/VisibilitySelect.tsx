import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"

export const visibilityOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'tier1', label: 'Tier 1' },
  { value: 'tier2', label: 'Tier 2' },
  { value: 'tier3', label: 'Tier 3' }
] as const;

export type VisibilityOption = typeof visibilityOptions[number]['value']

interface VisibilitySelectProps {
  value: VisibilityOption
  onValueChange: (value: VisibilityOption) => void
}

export function VisibilitySelect({ value, onValueChange }: VisibilitySelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="h-7 text-xs px-3 bg-[#E5DEFF] hover:bg-[#D6BCFA] border-0 rounded-full w-[100px] gap-1 text-[#403E43] flex items-center justify-between">
        {visibilityOptions.find(opt => opt.value === value)?.label}
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-[100px] p-0 rounded-lg"
      >
        {visibilityOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="justify-start h-8 px-3 text-xs cursor-pointer"
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}