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

// Fallback gradients when no articles are available
const fallbackGradients = [
  'linear-gradient(135deg, rgb(238,113,113) 1%, rgb(246,215,148) 58%)',
  'linear-gradient(135deg, rgb(147,39,143) 5.9%, rgb(234,172,232) 64%, rgb(246,219,245) 89%)',
  'linear-gradient(135deg, rgb(254,100,121) 0%, rgb(251,221,186) 100%)'
];

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
    
    if (!article) {
      // Use fallback gradient based on position
      const gradientStyle = {
        background: fallbackGradients[(position - 1) % fallbackGradients.length]
      };
      
      return (
        <div className="relative h-full w-full">
          <div 
            className="absolute inset-0" 
            style={gradientStyle}
          />
          <div className="relative h-full p-6 flex flex-col justify-end z-10">
            <h3 className="text-2xl font-black leading-tight text-white opacity-50">
              No content available
            </h3>
          </div>
        </div>
      );
    }

    // If article exists but no image, use gradient from database or fallback
    const hasCustomGradient = article.gradient_start_rgb && article.gradient_end_rgb;
    const backgroundStyle = article.image_url ? {} : {
      background: hasCustomGradient
        ? `linear-gradient(135deg, rgb(${article.gradient_start_rgb}) 0%, rgb(${article.gradient_end_rgb}) 100%)`
        : fallbackGradients[(position - 1) % fallbackGradients.length]
    };

    // Determine text color based on gradient colors
    const isLight = hasCustomGradient && article.gradient_start_rgb && isLightColor(article.gradient_start_rgb);
    const textColorClass = isLight ? "text-black" : "text-white";

    return (
      <div className="relative h-full w-full">
        {article.image_url ? (
          <div className="absolute inset-0">
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div 
            className="absolute inset-0"
            style={backgroundStyle}
          />
        )}
        {/* Gradient overlay - more prominent */}
        <div 
          className="absolute inset-0"
          style={{
            background: article.image_url 
              ? `linear-gradient(135deg, 
                  rgba(0,0,0,0.8) 0%, 
                  rgba(0,0,0,0.6) 30%, 
                  rgba(0,0,0,0.4) 60%, 
                  rgba(0,0,0,0.2) 100%)`
              : 'none'
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