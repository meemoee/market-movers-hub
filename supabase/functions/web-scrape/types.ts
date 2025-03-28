
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

export interface BraveSearchResult {
  web?: {
    results?: Array<{
      url: string;
      title: string;
      description: string;
    }>;
  };
}

export interface WebContent {
  url: string;
  title?: string;
  content: string;
}

export interface WebScrapeRequest {
  queries: string[];
  marketId: string;
  focusText?: string;
}

export interface WebScrapeResponse {
  jobId: string;
  message: string;
}
