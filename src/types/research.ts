// Defines the structure for a single search result obtained during research
export interface ResearchResult {
  url: string;
  content: string; // Often a snippet or description initially
  title?: string;
  source?: string; // e.g., 'brave_search', 'web_scrape'
}

// Defines the structure for the data collected and generated during a single research iteration
export interface ResearchIteration {
  iteration: number;
  queries?: string[];
  results?: ResearchResult[]; // Results gathered specifically in this iteration
  analysis?: string; // Analysis generated for this iteration's results
  // Add any other relevant fields captured per iteration
}

// Defines the structure for the final structured insights generated after all iterations
// Structure might vary based on the AI model's output format
export interface StructuredInsights {
  probability?: string; // e.g., "75%"
  key_findings?: string[];
  confidence_score?: number; // e.g., 0.8
  sentiment?: 'positive' | 'negative' | 'neutral';
  areas_for_further_research?: string[];
  // Include other fields as expected from the extract-research-insights function
  [key: string]: any; // Allow for flexibility in AI output
}

// Defines the structure for the overall results stored at the end of a job
export interface FinalResearchResults {
  data?: ResearchResult[]; // Aggregated results from all iterations (or just final relevant ones)
  analysis?: string; // The final comprehensive analysis text
  structuredInsights?: StructuredInsights;
  // Include raw AI response if needed for debugging
  rawInsightsResponse?: any;
}

// Defines the structure for a research job record in the database and used in the frontend
export interface ResearchJob {
  id: string; // UUID
  market_id: string; // Associated market
  query: string; // Initial query/description used
  status: 'queued' | 'processing' | 'completed' | 'failed';
  max_iterations: number;
  current_iteration: number;
  progress_log: string[]; // Array of log messages
  iterations: ResearchIteration[]; // Detailed data for each iteration
  results?: FinalResearchResults | string; // Final results (can be object or stringified JSON)
  error_message?: string;
  created_at: string; // ISO timestamp
  started_at?: string; // ISO timestamp
  completed_at?: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  user_id?: string; // Optional user association
  focus_text?: string; // Optional user-provided focus
  notification_email?: string; // Optional email for notification
  notification_sent?: boolean;
}

// Props for the main JobQueueResearchCard component (will be simplified after refactor)
export interface JobQueueResearchCardProps {
  description: string;
  marketId: string;
  bestBid?: number;
  bestAsk?: number;
  noBestAsk?: number;
  noBestBid?: number;
  outcomes?: string[];
}

// Type for the structured data passed to InsightsDisplay, including calculated opportunities
export interface InsightsDisplayData {
  rawText?: string; // Raw AI response string if available
  parsedData?: StructuredInsights & {
    goodBuyOpportunities?: GoodBuyOpportunity[] | null;
  };
}

// Type for calculated good buy opportunities
export interface GoodBuyOpportunity {
  outcome: string;
  predictedProbability: number;
  marketPrice: number;
  difference: string; // Formatted difference
}

// Type for market data needed by InsightsDisplay
export interface MarketContextData {
  bestBid?: number;
  bestAsk?: number;
  noBestAsk?: number;
  noBestBid?: number;
  outcomes?: string[];
}
