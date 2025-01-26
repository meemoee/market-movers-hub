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

const PLACEHOLDER_GRADIENTS = [
  'linear-gradient(135deg, #fdfcfb 0%, #e2d1c3 100%)',
  'linear-gradient(180deg, rgb(254,100,121) 0%, rgb(251,221,186) 100%)',
  'linear-gradient(to right, #ee9ca7, #ffdde1)'
];

const PLACEHOLDER_PROFILES = [
  { name: 'Alex Chen', price: 0.78, change: 0.12 },
  { name: 'Sarah Kim', price: 0.65, change: -0.08 },
  { name: 'Mike Davis', price: 0.92, change: 0.05 }
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
    const profile = PLACEHOLDER_PROFILES[position - 1];
    if (!profile) return null;

    const priceColor = profile.change >= 0 ? "text-green-500" : "text-red-500";

    return (
      <div className="flex items-center gap-2 mt-2 relative z-10">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-primary/10">
            <UserCircle className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">{profile.name}</span>
          <div className={cn("text-[10px] flex items-center gap-0.5 opacity-80", priceColor)}>
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
    
    if (!article) {
      const gradientIndex = (position - 1) % PLACEHOLDER_GRADIENTS.length;
      return (
        <div className="relative h-full w-full rounded-lg overflow-hidden border border-border/5">
          <div 
            className="absolute inset-0 rounded-lg"
            style={{ background: PLACEHOLDER_GRADIENTS[gradientIndex] }}
          />
        </div>
      );
    }

    const isLight = article.gradient_start_rgb && isLightColor(article.gradient_start_rgb);
    const textColorClass = isLight ? "text-black" : "text-white";
    const gradientAngle = "135deg";
    
    const content = (
      <div className="relative h-full w-full group rounded-lg overflow-hidden">
        {/* Image Background Layer */}
        <div className="absolute inset-0">
          {article.image_url && (
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          )}
        </div>
        
        {/* Gradient Overlay */}
        <div 
          className="absolute inset-0 backdrop-blur-[2px] pointer-events-none"
          style={{ 
            background: article.gradient_start_rgb && article.gradient_end_rgb
              ? `linear-gradient(${gradientAngle}, 
                  rgba(${article.gradient_end_rgb}, 0.75) 0%,
                  rgba(${article.gradient_end_rgb}, 0.6) 20%,
                  rgba(${article.gradient_end_rgb}, 0.4) 40%,
                  rgba(${article.gradient_end_rgb}, 0.2) 60%,
                  rgba(${article.gradient_end_rgb}, 0.1) 70%,
                  rgba(${article.gradient_start_rgb}, 0.08) 80%,
                  rgba(${article.gradient_start_rgb}, 0.05) 90%,
                  rgba(${article.gradient_start_rgb}, 0) 100%)`
                : `linear-gradient(${gradientAngle}, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)`
          }} 
        />

        {/* Content */}
        <div className="absolute inset-x-0 bottom-0 p-6 flex flex-col justify-end">
          <h3 className={cn("text-2xl font-black leading-tight mb-2", textColorClass)}>
            {article.title}
          </h3>
          {renderProfileInfo(position)}
        </div>
      </div>
    );

    if (!article.link) {
      return <div>{content}</div>;
    }

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
      <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-3">
        <div className="row-span-2 aspect-square">
          {renderArticle(1)}
        </div>
        <div className="h-full">
          {renderArticle(2)}
        </div>
        <div className="h-full">
          {renderArticle(3)}
        </div>
      </div>
    </div>
  );
}
