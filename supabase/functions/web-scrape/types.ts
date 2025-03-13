
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
