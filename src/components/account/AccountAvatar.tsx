import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle } from "lucide-react";

interface AccountAvatarProps {
  email: string | undefined;
}

export function AccountAvatar({ email }: AccountAvatarProps) {
  const initials = email?.split('@')[0]?.slice(0, 2).toUpperCase() || '??';
  
  return (
    <Avatar className="h-12 w-12 border border-border/50">
      <AvatarImage src="" alt="Profile picture" />
      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}