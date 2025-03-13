
export interface SSEMessage {
  type: 'message' | 'results' | 'error' | 'progress';
  message?: string;
  data?: Array<{
    url: string;
    title?: string;
    content: string;
  }>;
  progress?: {
    step: string;
    message: string;
    percentage?: number;
  };
}
