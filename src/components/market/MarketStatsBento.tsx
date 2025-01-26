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

// Default gradient backgrounds for when no image is available
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
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-primary/10">
            <UserCircle className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-white">{profile.name}</span>
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
    
    // If no article found, render placeholder gradient
    if (!article) {
      const gradientIndex = (position - 1) % PLACEHOLDER_GRADIENTS.length;
      return (
        <div className="relative h-full w-full rounded-lg overflow-hidden">
          <div 
            className="absolute inset-0 rounded-lg"
            style={{ background: PLACEHOLDER_GRADIENTS[gradientIndex] }}
          />
        </div>
      );
    }

    const content = (
      <div className="relative h-full w-full group rounded-lg overflow-hidden">
        {/* Image Layer */}
        <div className="absolute inset-0">
          {article.image_url ? (
            <img 
              src={article.image_url} 
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div 
              className="h-full w-full"
              style={{ 
                background: article.gradient_start_rgb && article.gradient_end_rgb
                  ? `linear-gradient(135deg, rgb(${article.gradient_start_rgb}), rgb(${article.gradient_end_rgb}))`
                  : PLACEHOLDER_GRADIENTS[0]
              }}
            />
          )}
        </div>

        {/* Content Layer - Using flex-col justify-end for proper alignment */}
        <div className="absolute inset-0 flex flex-col justify-end bg-black/70 backdrop-blur-sm p-4 rounded-lg">
          <h3 className="text-xl font-bold leading-tight mb-2 line-clamp-2 text-white">
            {article.title}
          </h3>
          {renderProfileInfo(position)}
        </div>
      </div>
    );

    // Wrap in link if URL exists
    if (!article.link) {
      return <div className="h-full">{content}</div>;
    }

    return (
      <a 
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full transition-opacity hover:opacity-95 cursor-pointer"
      >
        {content}
      </a>
    );
  };

  return (
    <div className="w-full mt-3">
      <div 
        className="grid grid-cols-1 md:grid-cols-2 gap-3" 
        style={{ aspectRatio: '16/9' }}
      >
        <div className="row-span-2 h-full">
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
