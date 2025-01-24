import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserCircle, Image as ImageIcon, Link as LinkIcon } from "lucide-react";

export function InsightPostBox() {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState("everyone");

  const handlePost = () => {
    // TODO: Implement post functionality
    console.log("Posting insight:", { content, visibility });
    setContent("");
  };

  return (
    <div className="w-full bg-card rounded-xl p-4 mb-6 border border-border">
      <div className="flex gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10">
            <UserCircle className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 space-y-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your market insight..."
            className="min-h-[100px] bg-background resize-none"
          />
          
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <ImageIcon className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <LinkIcon className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="flex items-center gap-3">
              <Select
                value={visibility}
                onValueChange={setVisibility}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="followers">Followers</SelectItem>
                  <SelectItem value="tier1">Tier 1</SelectItem>
                  <SelectItem value="tier2">Tier 2</SelectItem>
                  <SelectItem value="tier3">Tier 3</SelectItem>
                </SelectContent>
              </Select>
              
              <Button 
                onClick={handlePost}
                disabled={!content.trim()}
                className="px-6"
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}