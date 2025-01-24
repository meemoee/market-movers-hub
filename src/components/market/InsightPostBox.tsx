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
    <div className="w-full mb-4">
      <div className="flex gap-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10">
            <UserCircle className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 space-y-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your market insight..."
            className="min-h-[80px] bg-transparent resize-none border-none focus-visible:ring-1 text-sm"
          />
          
          <div className="flex items-center justify-between py-0.5">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary h-7 w-7 p-0">
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary h-7 w-7 p-0">
                <LinkIcon className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Select
                value={visibility}
                onValueChange={setVisibility}
              >
                <SelectTrigger className="h-7 text-xs px-2.5 bg-transparent border-muted/20 hover:bg-accent rounded-full w-[100px]">
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
                className="h-7 px-3 text-xs font-medium rounded-full"
                size="sm"
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
