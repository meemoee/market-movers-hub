
export interface SearchResponse {
  web?: {
    results: Array<{
      title: string;
      url: string;
      description: string;
    }>;
  };
}

export interface SSEMessage {
  type: 'message' | 'results' | 'error';
  message?: string;
  data?: Array<{
    url: string;
    title: string;
    content: string;
  }>;
}

export interface ResearchJob {
  id: string;
  user_id: string;
  market_id: string;
  query: string;
  focus_text?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  current_iteration: number;
  max_iterations: number;
  progress_log: string[];
  iterations: any[];
  results: Array<{
    url: string;
    title: string;
    content: string;
  }>;
  areas_for_research: string[];
  analysis?: string;
  probability?: string;
  parent_job_id?: string;
}
