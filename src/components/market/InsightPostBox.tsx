import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import * as React from "react";

// Custom textarea component without minimum height constraint
const TextareaAutosize = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md bg-transparent px-0 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
TextareaAutosize.displayName = "TextareaAutosize";

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
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center min-h-[40px]">
            <TextareaAutosize
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share your market insight..."
              className="text-lg placeholder:text-lg resize-none border-none leading-relaxed overflow-hidden"
              rows={1}
              style={{ height: content ? 'auto' : '32px' }}
            />
          </div>
          
          <Separator className="bg-border/50" />
          
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
                <SelectTrigger className="h-7 text-xs px-3 bg-[#E5DEFF] hover:bg-[#D6BCFA] border-0 rounded-full w-[100px] gap-1 text-[#403E43]">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent 
                  className="w-[100px] min-w-[100px]"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  onInteractOutside={() => {}}
                  onEscapeKeyDown={(e) => e.preventDefault()}
                  onPointerDownOutside={(e) => e.preventDefault()}
                >
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