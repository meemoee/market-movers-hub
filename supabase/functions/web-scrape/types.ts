
// Message types for streaming responses
export interface SSEMessage {
  type: string;
  data: any;
}

// Research progress types for structured updates
export interface ProgressUpdate {
  message: string;
  timestamp: string;
  type: 'status' | 'progress' | 'error' | 'info';
  data?: any;
}
