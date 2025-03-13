
export interface SSEMessage {
  type: 'message' | 'results' | 'error';
  message?: string;
  data?: Array<{
    url: string;
    title?: string;
    content: string;
  }>;
  job_id?: string;
  iteration?: number;
  max_iterations?: number;
}

export interface SearchResponse {
  web?: {
    results: Array<{
      title: string;
      url: string;
      description: string;
    }>;
  };
}

// Add a helper RPC function to supabase to help us append to JSON arrays
export interface AppendToJsonArrayParams {
  p_table: string;
  p_column: string;
  p_id: string;
  p_value: any;
}

export interface JobUpdateParams {
  status?: string;
  progress_log?: any[];
  current_iteration?: number;
  iterations?: any[];
  results?: any[];
  analysis?: string;
  error_message?: string;
  completed_at?: string | null;
  updated_at?: string;
  job_id?: string; // Added job_id to help track the primary job
  max_iterations?: number; // Added to track total iterations
}
