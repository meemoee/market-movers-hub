import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChartBar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import PriceChart from './PriceChart';
import { MarketQATree } from './MarketQATree';
import type { MarketEvent } from './chart/types';

interface MarketDetailsProps {
  bestBid: number;
  bestAsk: number;
  description?: string;
  marketId: string;
}

export function MarketDetails({
  bestBid,
  bestAsk,
  description,
  marketId,
}: MarketDetailsProps) {
  const [selectedInterval, setSelectedInterval] = useState('1d');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const { data: priceHistory, isLoading: isPriceLoading } = useQuery({
    queryKey: ['priceHistory', marketId, selectedInterval],
    queryFn: async () => {
      console.log('Fetching price history for market:', marketId);
      const response = await supabase.functions.invoke<{ t: string; y: number }[]>('price-history', {
        body: JSON.stringify({ marketId, interval: selectedInterval })
      });

      if (response.error) {
        console.error('Price history error:', response.error);
        throw response.error;
      }
      
      console.log('Price history response:', response.data);
      return response.data.map(point => ({
        time: new Date(point.t).getTime(),
        price: point.y * 100
      }));
    },
    enabled: !!marketId
  });

  const { data: marketEvents, isLoading: isEventsLoading } = useQuery({
    queryKey: ['marketEvents', marketId],
    queryFn: async () => {
      console.log('Fetching market events for:', marketId);
      const { data, error } = await supabase
        .from('market_events')
        .select('*')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Market events error:', error);
        throw error;
      }

      console.log('Market events response:', data);
      return data.map(event => ({
        ...event,
        timestamp: new Date(event.timestamp).getTime()
      }));
    },
    enabled: !!marketId
  });

  const handleGenerateAnalysis = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to generate analysis.",
          variant: "destructive"
        });
        return;
      }

      console.log('Generating analysis for market:', marketId, 'user:', user.id);
      const response = await supabase.functions.invoke('generate-qa-tree', {
        body: { marketId, userId: user.id }
      });

      if (response.error) {
        console.error('Generate analysis error:', response.error);
        toast({
          title: "Error",
          description: "Failed to generate analysis. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error generating analysis:', error);
      toast({
        title: "Error",
        description: "Failed to generate analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isLoading = isPriceLoading || isEventsLoading;

  return (
    <div className="space-y-4">
      {/* Price History Section */}
      <div>
        <div className="text-sm text-muted-foreground mb-2">Price History</div>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : priceHistory && priceHistory.length > 0 ? (
          <PriceChart
            data={priceHistory}
            events={marketEvents || []}
            selectedInterval={selectedInterval}
            onIntervalSelect={setSelectedInterval}
          />
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No price history available
          </div>
        )}
      </div>

      {/* Market Details Section */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Best Bid</div>
          <div className="text-lg font-semibold">{(bestBid * 100).toFixed(2)}¢</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Best Ask</div>
          <div className="text-lg font-semibold">{(bestAsk * 100).toFixed(2)}¢</div>
        </div>
      </div>

      {description && (
        <div>
          <div className="text-sm text-muted-foreground mb-1">Description</div>
          <div className="text-sm">{description}</div>
        </div>
      )}

      {/* Analysis Tree Section */}
      <div className="mt-6 border-t border-border pt-4">
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm text-muted-foreground">Analysis Tree</div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleGenerateAnalysis}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                <span className="ml-2">Generating...</span>
              </>
            ) : (
              <>
                <ChartBar className="mr-2 h-4 w-4" />
                Generate Analysis
              </>
            )}
          </Button>
        </div>
        <MarketQATree marketId={marketId} />
      </div>
    </div>
  );
}