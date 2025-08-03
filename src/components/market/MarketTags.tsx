import { Badge } from "@/components/ui/badge";

interface MarketTagsProps {
  primaryTags?: string[];
  tagSlugs?: string[];
  tags?: any[];
  maxTags?: number;
}

export function MarketTags({ primaryTags = [], tagSlugs = [], tags = [], maxTags = 3 }: MarketTagsProps) {
  // Use primary_tags first, then fallback to tag_slugs, then tags
  const displayTags = primaryTags.length > 0 
    ? primaryTags 
    : tagSlugs.length > 0 
    ? tagSlugs 
    : tags.map(tag => typeof tag === 'string' ? tag : tag.name || tag.slug || tag.label).filter(Boolean);

  if (!displayTags.length) return null;

  const visibleTags = displayTags.slice(0, maxTags);
  const remainingCount = displayTags.length - maxTags;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visibleTags.map((tag, index) => (
        <Badge
          key={index}
          variant="secondary"
          className="text-xs px-2 py-0.5 h-5 bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
        >
          {tag}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="outline"
          className="text-xs px-2 py-0.5 h-5 text-muted-foreground border-muted-foreground/30"
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}