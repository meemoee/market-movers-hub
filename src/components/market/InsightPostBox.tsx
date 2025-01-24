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
import { Separator } from "@/components/ui/separator";
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
            className="min-h-[40px] py-2 bg-transparent resize-none border-none focus-visible:ring-1 text-lg placeholder:text-lg transition-all duration-200"
          />
          
          <Separator className="bg-border/50" />
          
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary h-8 w-8 p-0">
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary h-8 w-8 p-0">
                <LinkIcon className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Select
                value={visibility}
                onValueChange={setVisibility}
              >
                <SelectTrigger className="h-8 text-xs px-2.5 bg-transparent border-muted/20 hover:bg-accent rounded-full w-[100px]">
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
                className="h-8 px-3 text-xs font-medium rounded-full"
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
