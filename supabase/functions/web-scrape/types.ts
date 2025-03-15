
export interface SSEMessage {
  type: 'message' | 'results' | 'error';
  message?: string;
  jobId?: string;
  data?: Array<{
    url: string;
    title?: string;
    content: string;
  }>;
}
