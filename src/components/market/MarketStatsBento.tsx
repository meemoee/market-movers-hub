import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface NewsArticle {
  id: string;
  title: string;
  subtitle: string | null;
  link: string | null;
  image_url: string | null;
  position: number;
}

function BentoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "relative h-full w-full overflow-hidden rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm",
      className
    )}>
      {children}
    </div>
  );
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
        .order('position');

      if (error) {
        console.error('Error fetching news articles:', error);
        return;
      }

      setArticles(data);
    };

    fetchArticles();
  }, [selectedInterval]);

  const renderArticle = (position: number) => {
    const article = articles.find(a => a.position === position);
    if (!article) return null;

    return (
      <div className="flex flex-col h-full">
        {article.image_url && (
          <div className="relative w-full h-32">
            <img 
              src={article.image_url} 
              alt={article.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-4 flex flex-col flex-grow">
          <h3 className="text-lg font-semibold mb-2">{article.title}</h3>
          {article.subtitle && (
            <p className="text-sm text-muted-foreground">{article.subtitle}</p>
          )}
          {article.link && (
            <a 
              href={article.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-auto text-sm text-blue-500 hover:text-blue-400"
            >
              Read more →
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full mt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left side - tall card */}
        <BentoCard className="md:row-span-2">
          {renderArticle(1)}
        </BentoCard>

        {/* Right side - two cards */}
        <BentoCard>
          {renderArticle(2)}
        </BentoCard>

        <BentoCard>
          {renderArticle(3)}
        </BentoCard>
      </div>
    </div>
  );
}