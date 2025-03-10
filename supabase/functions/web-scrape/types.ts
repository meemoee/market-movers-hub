
export interface SSEMessage {
  type: 'message' | 'results' | 'error';
  message?: string;
  data?: Array<{
    url: string;
    title?: string;
    content: string;
  }>;
}
