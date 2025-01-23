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
  gradient_start_rgb: string | null;
  gradient_end_rgb: string | null;
}

function isLightColor(rgb: string): boolean {
  const [r, g, b] = rgb.split(',').map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

function BentoCard({ children, className }: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg",
        className
      )}
    >
      <div className="h-full w-full bg-background rounded-lg overflow-hidden">
        {children}
      </div>
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

    const isLight = article.gradient_start_rgb && isLightColor(article.gradient_start_rgb);
    const textColorClass = isLight ? "text-black" : "text-white";

    return (
      <div className="relative h-full w-full">
        {article.image_url && (
          <div className="absolute inset-0">
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        {/* Enhanced gradient overlay with more pronounced color transition */}
        <div 
          className="absolute inset-0"
          style={{
            background: article.gradient_start_rgb && article.gradient_end_rgb
              ? `linear-gradient(135deg, 
                  rgba(${article.gradient_start_rgb}, 0.95) 0%, 
                  rgba(${article.gradient_start_rgb}, 0.85) 25%,
                  rgba(${article.gradient_end_rgb}, 0.75) 50%,
                  rgba(${article.gradient_end_rgb}, 0.85) 75%,
                  rgba(${article.gradient_end_rgb}, 0.95) 100%)`
              : 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 100%)'
          }}
        />
        <div className="relative h-full p-6 flex flex-col justify-end z-10">
          <h3 className={cn("text-2xl font-black leading-tight", textColorClass)}>
            {article.title}
          </h3>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full mt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BentoCard className="md:row-span-2 aspect-square">
          {renderArticle(1)}
        </BentoCard>

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