import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { UserCircle, Image as ImageIcon, Link as LinkIcon } from 'lucide-react'
import { cn } from "@/lib/utils"
import * as React from "react"
import { VisibilitySelect, type VisibilityOption } from "./VisibilitySelect";

// Custom textarea component that automatically adjusts height
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
  const [visibility, setVisibility] = useState<VisibilityOption>("everyone");

  const handlePost = () => {
    console.log("Posting insight:", { content, visibility });
    setContent("");
  };

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  return (
    <div className="w-full mb-4 py-4">
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
              onChange={(e) => {
                setContent(e.target.value);
                adjustTextareaHeight(e.target);
              }}
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
              <VisibilitySelect 
                value={visibility}
                onValueChange={setVisibility}
              />
              
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