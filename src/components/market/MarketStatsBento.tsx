import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserCircle, ArrowUp, ArrowDown } from "lucide-react";

interface NewsArticle {
  id: string;
  title: string;
  subtitle: string | null;
  link: string | null;
  image_url: string | null;
  position: number;
  gradient_start_rgb: string | null;
  gradient_end_rgb: string | null;
}

interface MarketStatsBentoProps {
  selectedInterval: string;
}

export function MarketStatsBento({ selectedInterval }: MarketStatsBentoProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);

  useEffect(() => {
    const fetchArticles = async () => {
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .eq('time_interval', selectedInterval)
        .or(`position.eq.1,position.eq.2,position.eq.3`)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching news articles:', error);
        return;
      }

      setArticles(data || []);
    };

    fetchArticles();
  }, [selectedInterval]);

  const renderProfileInfo = (position: number) => {
    const profile = {
      name: ['Alex Chen', 'Sarah Kim', 'Mike Davis'][position - 1],
      price: [0.78, 0.65, 0.92][position - 1],
      change: [0.12, -0.08, 0.05][position - 1],
    };

    const priceColor = profile.change >= 0 ? "text-green-500" : "text-red-500";

    return (
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-primary/10">
            <UserCircle className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground">{profile.name}</span>
          <div className={cn("text-[10px] flex items-center gap-0.5 opacity-90", priceColor)}>
            <span>${profile.price.toFixed(2)}</span>
            <span className="inline-flex items-center">
              {profile.change > 0 ? (
                <ArrowUp className="h-2 w-2" />
              ) : (
                <ArrowDown className="h-2 w-2" />
              )}
              {Math.abs(profile.change * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderArticle = (position: number) => {
    const article = articles.find(a => a.position === position);
    const isMainArticle = position === 1;
    const containerHeight = isMainArticle ? '400px' : '200px';
    const imageHeight = isMainArticle ? '320px' : '120px';
    
    if (!article) {
      return (
        <div className="rounded-lg bg-muted/10 border border-border/5" style={{ height: containerHeight }} />
      );
    }
    
    const content = (
      <div className="flex flex-col h-full group">
        <div 
          className="relative rounded-lg overflow-hidden flex-shrink-0"
          style={{ height: imageHeight }}
        >
          <div className="absolute inset-0 bg-card/50" />
          {article.image_url && (
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          )}
        </div>

        <div className="flex-shrink-0 h-[80px] -mt-3 rounded-lg bg-card border border-border/10 p-3 transition-colors group-hover:bg-card/80">
          <div className="flex flex-col justify-between h-full">
            {renderProfileInfo(position)}
            <h3 className="text-sm font-semibold leading-tight text-foreground line-clamp-2">
              {article.title}
            </h3>
          </div>
        </div>
      </div>
    );

    if (!article.link) {
      return <div style={{ height: containerHeight }}>{content}</div>;
    }

    return (
      <a 
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-opacity hover:opacity-95 cursor-pointer"
        style={{ height: containerHeight }}
      >
        {content}
      </a>
    );
  };

  return (
    <div className="w-full mt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          {renderArticle(1)}
        </div>
        <div className="grid grid-rows-2 gap-2">
          <div>
            {renderArticle(2)}
          </div>
          <div>
            {renderArticle(3)}
          </div>
        </div>
      </div>
    </div>
  );
}
