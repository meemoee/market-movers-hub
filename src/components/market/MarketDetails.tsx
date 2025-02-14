
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PriceChart from './PriceChart';
import { QADisplay } from './QADisplay';
import { WebResearchCard } from './WebResearchCard';
import { RelatedMarkets } from './RelatedMarkets';
import { SimilarHistoricalEvents } from './SimilarHistoricalEvents';

interface MarketDetailsProps {
  description?: string;
  marketId: string;
  question: string;
  selectedInterval: string;
  eventId?: string;
  subtitle?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
}

export function MarketDetails({
  description,
  marketId,
  question,
  selectedInterval,
  eventId,
  subtitle,
  yesSubTitle,
  noSubTitle
}: MarketDetailsProps) {
  return (
    <div className="space-y-4">
      {/* Price History Section */}
      <div>
        <div className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">Price History</div>
        </div>
        <PriceChart 
          marketId={marketId}
          selectedInterval={selectedInterval}
        />
      </div>

      {/* Related Markets Section */}
      {eventId && (
        <RelatedMarkets 
          eventId={eventId}
          marketId={marketId}
          selectedInterval={selectedInterval}
        />
      )}

      {/* Web Research Section */}
      {description && (
        <WebResearchCard 
          description={description} 
          marketId={marketId}
          question={question}
          subtitle={subtitle}
          yesSubTitle={yesSubTitle}
          noSubTitle={noSubTitle}
        />
      )}

      {/* QA Tree Section */}
      <div className="mt-6 border-t border-border pt-4">
        <div className="text-sm text-muted-foreground mb-2">Analysis Tree</div>
        <QADisplay 
          marketId={marketId} 
          marketQuestion={question}
        />
      </div>

      {/* Similar Historical Events Section */}
      <div className="mt-6">
        <SimilarHistoricalEvents />
      </div>
    </div>
  );
}
