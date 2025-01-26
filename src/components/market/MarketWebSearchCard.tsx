import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MarketWebSearchCardProps {
  marketDescription: string;
}

export function MarketWebSearchCard({ marketDescription }: MarketWebSearchCardProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [websiteCount, setWebsiteCount] = useState(0);
  const [analysis, setAnalysis] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleSearch = async () => {
    console.log('Starting web research with description:', marketDescription);
    if (!marketDescription) {
      console.error('No market description provided');
      return;
    }

    setIsSearching(true);
    setAnalysis("");
    setWebsiteCount(0);
    setError("");

    try {
      const { data, error } = await supabase.functions.invoke('web-research', {
        body: { description: marketDescription }
      });

      if (error) {
        console.error('Error invoking web-research function:', error);
        setError('Failed to start web research');
        throw error;
      }

      console.log('Received response from web-research:', data);
      const reader = new Response(data.body).body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream complete');
          break;
        }

        const chunk = decoder.decode(value);
        console.log('Received chunk:', chunk);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('Parsed streaming data:', data);
              
              if (data.type === 'websites') {
                console.log('Updating website count:', data.count);
                setWebsiteCount(data.count);
              } else if (data.type === 'analysis') {
                console.log('Updating analysis with content:', data.content);
                setAnalysis(prev => prev + data.content);
              }
            } catch (e) {
              console.error('Error parsing chunk:', e, 'Raw line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during web research:', error);
      setError('Failed to complete web research');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card className="p-4 mt-4">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Web Research Analysis</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSearch}
            disabled={isSearching}
            className="flex items-center gap-2"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing {websiteCount} websites...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Analyze Market
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="text-sm text-red-500">
            {error}
          </div>
        )}

        {analysis && (
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
            {analysis}
          </div>
        )}
      </div>
    </Card>
  );
}