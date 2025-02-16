
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserCircle, ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useEventListener } from "@/hooks/use-event-listener";
import type { CarouselApi } from "@/components/ui/carousel";

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
  const [api, setApi] = useState<CarouselApi>();
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchArticles = async () => {
      console.log('Fetching articles for interval:', selectedInterval);
      
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .eq('time_interval', selectedInterval)
        .in('position', [1, 2, 3])
        .order('updated_at', { ascending: false })
        .order('position', { ascending: true });

      if (error) {
        console.error('Error fetching news articles:', error);
        return;
      }

      // Group articles by position and get the latest for each
      const latestByPosition = data?.reduce((acc, article) => {
        const existingArticle = acc[article.position];
        if (!existingArticle || 
            new Date(article.updated_at) > new Date(existingArticle.updated_at)) {
          acc[article.position] = article;
        }
        return acc;
      }, {} as Record<number, NewsArticle>);

      // Convert to array and sort by position
      const sortedArticles = Object.values(latestByPosition)
        .sort((a, b) => a.position - b.position);

      console.log('Processed articles:', {
        total: data?.length,
        byPosition: latestByPosition,
        final: sortedArticles
      });
      
      setArticles(sortedArticles);
    };

    fetchArticles();
  }, [selectedInterval]);

  useEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (!carouselRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      if (e.deltaY > 0) {
        api?.scrollNext();
      } else {
        api?.scrollPrev();
      }
    },
    carouselRef.current,
    { passive: false }
  );

  const renderProfileInfo = (position: number) => {
    const profile = PLACEHOLDER_PROFILES[position - 1];
    if (!profile) return null;

    const priceColor = profile.change >= 0 ? "text-green-500" : "text-red-500";

    return (
      <div className="flex items-center gap-2 relative z-10">
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
                <ArrowUpIcon className="h-2 w-2" />
              ) : (
                <ArrowDownIcon className="h-2 w-2" />
              )}
              {Math.abs(profile.change * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderArticle = (article: NewsArticle) => {
    if (!article) {
      return (
        <div className="relative h-full w-full rounded-lg overflow-hidden border border-border/5">
          <div className="absolute inset-0 rounded-lg bg-transparent" />
        </div>
      );
    }

    const content = (
      <div className="relative h-full w-full group rounded-lg overflow-hidden">
        <div className="absolute inset-0 bg-transparent" />
        
        <div className="relative h-full w-full flex flex-col rounded-lg overflow-hidden">
          <div className="relative w-full h-3/5 overflow-hidden rounded-t-lg p-4">
            {article.image_url ? (
              <div className="relative h-full w-full">
                <img 
                  src={article.image_url} 
                  alt={article.title}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 rounded-lg relative z-0"
                />
              </div>
            ) : (
              <div className="h-full w-full rounded-lg bg-transparent" />
            )}
          </div>

          <div className="flex-1 p-4 flex flex-col justify-between relative">
            <div className="space-y-2 px-12 relative z-10">
              <h3 className="text-2xl font-bold leading-tight mb-2 line-clamp-2">
                {article.title}
              </h3>
              {article.subtitle && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {article.subtitle}
                </p>
              )}
            </div>
            {renderProfileInfo(article.position)}
          </div>
        </div>
      </div>
    );

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
      <div ref={carouselRef}>
        <Carousel className="w-full relative" opts={{ loop: true }} setApi={setApi}>
          <CarouselContent>
            {articles.map((article) => (
              <CarouselItem key={article.id} className="h-[500px]">
                {renderArticle(article)}
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="absolute left-4 top-[80%] -translate-y-1/2 h-8 w-8 rounded-full bg-transparent hover:bg-black/10 border-0 text-foreground" />
          <CarouselNext className="absolute right-4 top-[80%] -translate-y-1/2 h-8 w-8 rounded-full bg-transparent hover:bg-black/10 border-0 text-foreground" />
        </Carousel>
      </div>
    </div>
  );
}
