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

const PLACEHOLDER_GRADIENTS = [
  'linear-gradient(135deg, #fdfcfb 0%, #e2d1c3 100%)',
  'linear-gradient(180deg, rgb(254,100,121) 0%, rgb(251,221,186) 100%)',
  'linear-gradient(to right, #ee9ca7, #ffdde1)'
];

function isLightColor(rgb: string): boolean {
  const [r, g, b] = rgb.split(',').map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
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
        // Get distinct on position, ordered by created_at desc within each position
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

  const renderArticle = (position: number) => {
    const article = articles.find(a => a.position === position);
    
    if (!article) {
      const gradientIndex = (position - 1) % PLACEHOLDER_GRADIENTS.length;
      return (
        <div className="relative h-full w-full">
          <div 
            className="absolute inset-0"
            style={{ background: PLACEHOLDER_GRADIENTS[gradientIndex] }}
          />
        </div>
      );
    }

    const isLight = article.gradient_start_rgb && isLightColor(article.gradient_start_rgb);
    const textColorClass = isLight ? "text-black" : "text-white";
    
    const content = (
      <div className="relative h-full w-full group">
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          {article.image_url && (
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          )}
          
          {/* Gradient overlay */}
          <div 
            className="absolute -inset-[50px] rounded-lg scale-110 transform"
            style={{ 
              background: article.gradient_start_rgb && article.gradient_end_rgb
                ? `linear-gradient(to top, 
                    rgb(${article.gradient_start_rgb}) 0%, 
                    rgba(${article.gradient_end_rgb}, 0.98) 20%,
                    rgba(${article.gradient_end_rgb}, 0.85) 40%,
                    rgba(${article.gradient_end_rgb}, 0.7) 60%,
                    rgba(${article.gradient_end_rgb}, 0.5) 80%)`
                : 'linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.85) 20%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.0) 80%)'
            }} 
          />
        </div>

        {/* Content */}
        <div className="relative h-full p-6 flex flex-col justify-end z-10">
          <h3 className={cn("text-2xl font-black leading-tight", textColorClass)}>
            {article.title}
          </h3>
        </div>
      </div>
    );

    // If no link, return content without anchor wrapper
    if (!article.link) {
      return content;
    }

    // Wrap in anchor tag if link exists
    return (
      <a 
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full w-full transition-opacity hover:opacity-95 cursor-pointer"
      >
        {content}
      </a>
    );
  };

  return (
    <div className="w-full mt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* First column - large box */}
        <div className="md:row-span-2 aspect-square">
          {renderArticle(1)}
        </div>

        {/* Second column - two smaller boxes */}
        <div>
          {renderArticle(2)}
        </div>
        <div>
          {renderArticle(3)}
        </div>
      </div>
    </div>
  );
}
