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

// Helper function to determine if colors are light or dark
function isLightColor(rgb: string): boolean {
  const [r, g, b] = rgb.split(',').map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

function BentoCard({ children, className, gradientStart, gradientEnd }: { 
  children: React.ReactNode; 
  className?: string;
  gradientStart?: string;
  gradientEnd?: string;
}) {
  const borderStyle = gradientStart && gradientEnd
    ? {
        border: 'none',
        background: `linear-gradient(to right, rgb(${gradientStart}), rgb(${gradientEnd})) border-box`,
        padding: '4px', // Increased padding for even thicker border
      }
    : {};

  return (
    <div 
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg",
        className
      )}
      style={borderStyle}
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

    // Determine text color based on gradient colors
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
        {/* Gradient overlay - now more prominent and always visible */}
        <div 
          className="absolute inset-0"
          style={{
            background: article.gradient_start_rgb && article.gradient_end_rgb
              ? `linear-gradient(to top, 
                  rgb(${article.gradient_start_rgb}) 0%, 
                  rgba(${article.gradient_start_rgb}, 0.8) 30%, 
                  rgba(${article.gradient_end_rgb}, 0.4) 60%, 
                  rgba(${article.gradient_end_rgb}, 0.1) 100%)`
              : 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.1) 100%)'
          }}
        />
        <div className="relative h-full p-4 flex flex-col justify-end z-10">
          <h3 className={cn("text-lg font-semibold mb-2", textColorClass)}>{article.title}</h3>
          {article.subtitle && (
            <p className={cn("text-sm opacity-90", textColorClass)}>{article.subtitle}</p>
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
        <BentoCard 
          className="md:row-span-2 aspect-square"
          gradientStart={articles[0]?.gradient_start_rgb || undefined}
          gradientEnd={articles[0]?.gradient_end_rgb || undefined}
        >
          {renderArticle(1)}
        </BentoCard>

        <BentoCard
          gradientStart={articles[1]?.gradient_start_rgb || undefined}
          gradientEnd={articles[1]?.gradient_end_rgb || undefined}
        >
          {renderArticle(2)}
        </BentoCard>

        <BentoCard
          gradientStart={articles[2]?.gradient_start_rgb || undefined}
          gradientEnd={articles[2]?.gradient_end_rgb || undefined}
        >
          {renderArticle(3)}
        </BentoCard>
      </div>
    </div>
  );
}