import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface WebResearchCardProps {
  description: string;
  marketId: string;
  question: string;
}

export function WebResearchCard({ description, marketId, question }: WebResearchCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [researchContent, setResearchContent] = useState<string[]>([]);

  const handleResearch = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('web_research')
        .select('*')
        .eq('market_id', marketId);

      if (error) throw error;

      const allContent = data.map(item => item.content);
      setResearchContent(allContent);

      const analysisResponse = await supabase.functions.invoke('analyze-web-content', {
        body: { 
          content: allContent.join('\n\n'),
          query: description,
          marketQuestion: question // Add the market question here
        }
      });

      if (analysisResponse.error) {
        throw analysisResponse.error;
      }

      toast({
        title: 'Analysis Complete',
        description: 'The web research analysis has been completed successfully.',
      });
    } catch (error) {
      console.error('Error during research:', error);
      toast({
        variant: 'destructive',
        title: 'Research Error',
        description: error instanceof Error ? error.message : 'Failed to perform web research',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Web Research</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button onClick={handleResearch} disabled={loading}>
        {loading ? 'Loading...' : 'Analyze Web Content'}
      </Button>
      {researchContent.length > 0 && (
        <div className="mt-4">
          <h4 className="text-md font-semibold">Research Content</h4>
          <ul>
            {researchContent.map((content, index) => (
              <li key={index} className="text-sm text-muted-foreground">{content}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
