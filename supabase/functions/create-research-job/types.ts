
export interface ResearchRequest {
  marketId: string;
  query: string;
  maxIterations?: number;
  focusText?: string;
  notificationEmail?: string;
}

export interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: any[];
  results: any;
  error_message?: string;
  focus_text?: string;
  notification_email?: string;
  notification_sent?: boolean;
}

export interface AnalysisStreamChunk {
  id: string;
  job_id: string;
  iteration: number; // Use 0 for final analysis
  chunk: string;
  sequence: number;
  created_at: string;
}
