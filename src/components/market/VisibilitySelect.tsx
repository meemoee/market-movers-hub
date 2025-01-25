import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger 
        className="h-7 text-xs px-3 bg-[#E5DEFF] hover:bg-[#D6BCFA] border-0 rounded-full w-[100px] gap-1 text-[#403E43] flex items-center justify-between"
      >
        <SelectValue>{visibilityOptions.find(opt => opt.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="w-[100px] p-0">
        <SelectGroup>
          {visibilityOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="justify-start h-8 px-3 text-xs cursor-pointer"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}