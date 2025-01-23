import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AspectRatio } from "@/components/ui/aspect-ratio";

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

function BentoCard({ children, className }: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg", className)}>
      <div className="w-full bg-background rounded-lg overflow-hidden">
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
      const gradientIndex = (position - 1) % PLACEHOLDER_GRADIENTS.length;
      return (
        <div className="absolute inset-0">
          <div 
            className="w-full h-full"
            style={{ background: PLACEHOLDER_GRADIENTS[gradientIndex] }}
          />
        </div>
      );
    }

    const isLight = article.gradient_start_rgb && isLightColor(article.gradient_start_rgb);
    const textColorClass = isLight ? "text-black" : "text-white";

    const gradientStyle = article.gradient_start_rgb && article.gradient_end_rgb
      ? `linear-gradient(to top, 
          rgb(${article.gradient_start_rgb}) 0%, 
          rgba(${article.gradient_end_rgb}, 0.95) 20%,
          rgba(${article.gradient_end_rgb}, 0.8) 40%,
          rgba(${article.gradient_end_rgb}, 0.4) 60%,
          rgba(${article.gradient_end_rgb}, 0) 80%)`
      : 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 20%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0) 80%)';

    return (
      <div className="absolute inset-0">
        {article.image_url && (
          <div className="absolute inset-0">
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        
        <div 
          className="absolute inset-0"
          style={{ background: gradientStyle }} 
        />

        {/* Content */}
        <div className="relative h-full p-6 flex flex-col justify-end">
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
        <div className="md:row-span-2">
          <AspectRatio ratio={1} className="overflow-hidden">
            <BentoCard>
              {renderArticle(1)}
            </BentoCard>
          </AspectRatio>
        </div>

        <BentoCard>
          <AspectRatio ratio={2}>
            {renderArticle(2)}
          </AspectRatio>
        </BentoCard>

        <BentoCard>
          <AspectRatio ratio={2}>
            {renderArticle(3)}
          </AspectRatio>
        </BentoCard>
      </div>
    </div>
  );
}