import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle } from "lucide-react";

interface AccountAvatarProps {
  email: string | undefined;
}

export function AccountAvatar({ email }: AccountAvatarProps) {
  const initials = email?.charAt(0).toUpperCase() || '?';
  
  return (
    <Avatar className="h-16 w-16">
      <AvatarImage src="" alt="Profile picture" />
      <AvatarFallback className="bg-primary/10">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}