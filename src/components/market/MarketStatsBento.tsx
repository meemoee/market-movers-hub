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
      "relative h-full w-full overflow-hidden rounded-lg border border-border/50",
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
      <div className="relative h-full w-full">
        {article.image_url && (
          <div className="absolute inset-0">
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover"
            />
            {/* Dark overlay for better text readability */}
            <div className="absolute inset-0 bg-black/40" />
          </div>
        )}
        <div className="relative h-full p-4 flex flex-col justify-end z-10">
          <h3 className="text-lg font-semibold mb-2 text-white">{article.title}</h3>
          {article.subtitle && (
            <p className="text-sm text-white/80">{article.subtitle}</p>
          )}
          {article.link && (
            <a 
              href={article.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-2 text-sm text-blue-300 hover:text-blue-200"
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
        {/* Left side - square card */}
        <BentoCard className="md:row-span-2 aspect-square">
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