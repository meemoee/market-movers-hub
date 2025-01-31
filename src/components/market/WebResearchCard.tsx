import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface WebResearchCardProps {
  marketId: string;
  question: string;
}

export function WebResearchCard({ marketId, question }: WebResearchCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleResearch = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          marketId,
          question,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch research results');
      }
      
      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full space-y-4 p-4 backdrop-blur-md bg-black/30 border border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Web Research</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResearch}
          disabled={isLoading}
          className="h-8"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Researching...
            </>
          ) : (
            'Research'
          )}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <Separator />
          {results.map((result, index) => (
            <div key={index} className="space-y-1">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline flex items-center gap-1"
              >
                {result.title}
                <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-sm text-muted-foreground">
                {result.snippet}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}