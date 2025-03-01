
export interface SSEMessage {
  type: 'message' | 'results' | 'error';
  message?: string;
  data?: any;
}
