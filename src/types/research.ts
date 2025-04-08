
export interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

export interface ReasoningData {
  evidenceFor?: string[];
  evidenceAgainst?: string[];
}

export interface StreamingState {
  rawText: string;
  parsedData: {
    probability: string;
    areasForResearch: string[];
    reasoning?: ReasoningData | string;
    goodBuyOpportunities?: Array<{
      outcome: string;
      predictedProbability: number;
      marketPrice: number;
      difference: string;
    }> | null;
  } | null;
}

export interface MarketData {
  bestBid?: number;
  bestAsk?: number;
  noBestAsk?: number;
  noBestBid?: number;
  outcomes?: string[];
}

export interface ResearchIteration {
  iteration: number;
  queries: string[];
  results: ResearchResult[];
  analysis: string;
}

export interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: ResearchIteration[];
  results: any;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
  user_id?: string;
  focus_text?: string;
  notification_email?: string;
  notification_sent?: boolean;
}

export interface ResearchChild {
  id: string;
  focusText: string;
  onView: () => void;
}
