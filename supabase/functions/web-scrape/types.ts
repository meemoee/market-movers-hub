
export interface SSEMessage {
  type: 'message' | 'results' | 'error';
  message?: string;
  data?: Array<{
    url: string;
    title?: string;
    content: string;
  }>;
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
  p_array: string;
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
  completed_at?: string;
  updated_at?: string;
}
