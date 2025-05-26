
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { UserCircle, Image as ImageIcon, Link as LinkIcon, Globe, Lock, Sparkle } from 'lucide-react'
import { cn } from "@/lib/utils"
import * as React from "react"
import { useIsMobile } from '@/hooks/use-mobile';
import { PortfolioGeneratorDropdown } from "./PortfolioGeneratorDropdown";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

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
  const [isPrivate, setIsPrivate] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isPortfolioDropdownOpen, setIsPortfolioDropdownOpen] = useState(false);
  const [portfolioContent, setPortfolioContent] = useState("");
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const portfolioButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (isPrivacyOpen) {
        setIsPrivacyOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isPrivacyOpen]);

  const handlePost = async () => {
    if (!content.trim()) return;
    
    try {
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to post insights",
          variant: "destructive"
        });
        return;
      }
      
      // Insert into market_insights table
      const { error } = await supabase
        .from('market_insights')
        .insert({
          content: content.trim(),
          user_id: user.id,
          is_private: isPrivate
        });
        
      if (error) {
        console.error('Error posting insight:', error);
        toast({
          title: "Error posting insight",
          description: error.message,
          variant: "destructive"
        });
        return;
      }
      
      toast({
        title: "Insight posted",
        description: "Your market insight has been successfully posted",
      });
      
      // Clear the form
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = '32px';
      }
    } catch (error) {
      console.error('Error posting insight:', error);
      toast({
        title: "Error",
        description: "Something went wrong while posting your insight",
        variant: "destructive"
      });
    }
  };

  const handleGeneratePortfolio = () => {
    if (!content.trim()) {
      toast({
        title: "No content provided",
        description: "Please share your market insight before generating a portfolio",
        variant: "destructive" // Changed from "warning" to "destructive"
      });
      return;
    }
    setPortfolioContent(content);
    setIsPortfolioDropdownOpen(true);
  };

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  return (
    <>
      <div className={`w-full mb-4 py-4 ${isMobile ? 'px-2' : 'px-6'} box-border overflow-hidden`}>
        <div className="flex gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-primary/10">
              {localStorage.getItem('userEmail')?.charAt(0).toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center min-h-[40px]">
              <TextareaAutosize
                ref={textareaRef}
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
            
            <div className="flex items-center justify-between py-0.5 flex-wrap gap-2">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary h-7 w-7 p-0">
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary h-7 w-7 p-0">
                  <LinkIcon className="h-4 w-4" />
                </Button>
                <Button
                  ref={portfolioButtonRef}
                  variant="ghost"
                  size="sm"
                  onClick={handleGeneratePortfolio}
                  className="h-7 px-3 text-xs font-medium rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center gap-1 ml-2"
                >
                  {isMobile ? (
                    <Sparkle className="h-3 w-3" />
                  ) : (
                    <>
                      Generate portfolio
                      <Sparkle className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPrivacyOpen(!isPrivacyOpen)}
                    className="h-7 px-2 flex items-center gap-1 text-xs"
                  >
                    {isPrivate ? (
                      <>
                        <Lock className="h-3 w-3" />
                        {!isMobile && "Private"}
                      </>
                    ) : (
                      <>
                        <Globe className="h-3 w-3" />
                        {!isMobile && "Public"}
                      </>
                    )}
                  </Button>
                  
                  {isPrivacyOpen && (
                    <div className="absolute right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50">
                      <button
                        className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent/50 flex items-center gap-1"
                        onClick={() => {
                          setIsPrivate(false);
                          setIsPrivacyOpen(false);
                        }}
                      >
                        <Globe className="h-3 w-3" />
                        Public
                      </button>
                      <button
                        className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent/50 flex items-center gap-1"
                        onClick={() => {
                          setIsPrivate(true);
                          setIsPrivacyOpen(false);
                        }}
                      >
                        <Lock className="h-3 w-3" />
                        Private
                      </button>
                    </div>
                  )}
                </div>
                
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
      
      <PortfolioGeneratorDropdown 
        content={portfolioContent}
        isOpen={isPortfolioDropdownOpen}
        onClose={() => setIsPortfolioDropdownOpen(false)}
        triggerRef={portfolioButtonRef}
      />
    </>
  );
}
