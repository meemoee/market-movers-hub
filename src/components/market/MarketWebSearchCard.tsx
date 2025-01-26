import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast"; // Added proper import

interface MarketWebSearchCardProps {
  marketDescription: string;
}

export function MarketWebSearchCard({ marketDescription }: MarketWebSearchCardProps) {
  const { toast } = useToast(); // Initialize toast hook
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
        toast({
          variant: "destructive",
          title: "Research Error",
          description: "Failed to start web research. Please try again."
        });
        throw error;
      }
  
      console.log('Received response from web-research:', data);
      const reader = new Response(data.body).body?.getReader();
      const decoder = new TextDecoder();
  
      let accumulatedContent = '';
  
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream complete');
          break;
        }
  
        const chunk = decoder.decode(value);
        console.log('Received chunk:', chunk);
        const lines = chunk.split('\n').filter(line => line.trim());
  
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
  
            try {
              const parsed = JSON.parse(jsonStr);
              
              // Handle website count updates
              if (parsed.type === 'websites') {
                console.log('Updating website count:', parsed.count);
                setWebsiteCount(parsed.count);
                continue;
              }
              
              // Handle analysis content
              if (parsed.type === 'analysis') {
                console.log('Updating analysis with content:', parsed.content);
                setAnalysis(prev => prev + parsed.content);
                continue;
              }
  
              // Handle legacy format (if any previous format exists)
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                accumulatedContent += content;
                
                try {
                  const parsedJson = JSON.parse(accumulatedContent);
                  if (parsedJson && typeof parsedJson === 'object' && parsedJson.content) {
                    setAnalysis(prev => prev + parsedJson.content);
                  }
                } catch (parseError) {
                  // Continue accumulating if not valid JSON yet
                  continue;
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e, 'Raw line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in handleSearch:', error);
      setError(error.message || 'An error occurred during web research');
      toast({
        variant: "destructive",
        title: "Research Error",
        description: "Failed to complete web research. Please try again.",
      });
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
