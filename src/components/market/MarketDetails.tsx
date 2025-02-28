
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimilarHistoricalEvents } from "./SimilarHistoricalEvents";
import { QADisplay } from "./QADisplay";
import PriceChart from "./PriceChart";
import { RelatedMarkets } from "./RelatedMarkets";
import { WebResearchCard } from "./WebResearchCard";
import { DeepResearchCard } from "./DeepResearchCard";
import { supabase } from "@/integrations/supabase/client";

interface MarketDetailsProps {
  description?: string;
  marketId: string;
  question: string;
  selectedInterval: string;
  eventId?: string;
}

export function MarketDetails({
  description,
  marketId,
  question,
  selectedInterval,
  eventId,
}: MarketDetailsProps) {
  const [qaTree, setQATree] = useState<any | null>(null);
  const [isLoadingQATree, setIsLoadingQATree] = useState(false);

  useEffect(() => {
    async function fetchQATree() {
      setIsLoadingQATree(true);
      try {
        const { data, error } = await supabase
          .from('qa_trees')
          .select('*')
          .eq('market_id', marketId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching QA tree:', error);
        } else if (data) {
          setQATree(data.tree_data);
        }
      } catch (error) {
        console.error('Failed to fetch QA tree:', error);
      } finally {
        setIsLoadingQATree(false);
      }
    }

    if (marketId) {
      fetchQATree();
    }
  }, [marketId]);

  return (
    <div className="space-y-3">
      {description && (
        <div className="rounded-lg bg-accent/10 p-3">
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}

      <Tabs defaultValue="price">
        <TabsList className="justify-start bg-transparent">
          <TabsTrigger value="price">Price</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="debates">Debates</TabsTrigger>
          <TabsTrigger value="similar">Similar</TabsTrigger>
        </TabsList>
        
        <TabsContent value="price" className="mt-4 space-y-4">
          <PriceChart marketId={marketId} selectedInterval={selectedInterval} onIntervalSelect={() => {}} />
          {eventId && <RelatedMarkets eventId={eventId} marketId={marketId} selectedInterval={selectedInterval} />}
        </TabsContent>
        
        <TabsContent value="research" className="mt-4 space-y-4">
          <DeepResearchCard marketId={marketId} question={question} />
          <WebResearchCard marketId={marketId} />
        </TabsContent>
        
        <TabsContent value="debates" className="mt-4">
          <QADisplay marketId={marketId} marketQuestion={question} />
        </TabsContent>
        
        <TabsContent value="similar" className="mt-4">
          <SimilarHistoricalEvents marketId={marketId} question={question} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
