
export interface SSEMessage {
  type: 'message' | 'results' | 'error' | 'job_created' | 'job_status';
  message?: string;
  data?: Array<{
    url: string;
    title?: string;
    content: string;
  }>;
  jobId?: string;
  status?: string;
}
