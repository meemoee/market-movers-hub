
export interface SSEConnection {
  eventSource: EventSource | null;
  isConnected: boolean;
  error: Error | null;
}

export enum StreamEventType {
  START = 'start',
  CONTENT = 'content',
  ERROR = 'error',
  DONE = 'done',
  HEARTBEAT = 'heartbeat'
}

export interface StreamEvent {
  type: StreamEventType;
  data?: any;
  error?: string;
  timestamp?: number;
}

export interface StreamOptions {
  retryLimit?: number;
  retryDelay?: number;
  onStart?: () => void;
  onContent: (content: string) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  onHeartbeat?: () => void;
}

export const setupSSEConnection = (
  url: string,
  options: StreamOptions
): SSEConnection => {
  let retryCount = 0;
  const retryLimit = options.retryLimit || 3;
  const retryDelay = options.retryDelay || 2000;
  
  try {
    console.log(`Setting up SSE connection to ${url}`);
    const eventSource = new EventSource(url);
    
    eventSource.onopen = () => {
      console.log('SSE connection opened');
      retryCount = 0;
      if (options.onStart) options.onStart();
    };
    
    eventSource.onmessage = (event) => {
      try {
        // Handle standard SSE messages
        if (event.data === '[DONE]') {
          console.log('SSE stream completed with [DONE] marker');
          if (options.onComplete) options.onComplete();
          eventSource.close();
          return;
        }
        
        const parsed = JSON.parse(event.data);
        
        // Handle structured stream events
        if (parsed.type) {
          switch (parsed.type) {
            case StreamEventType.START:
              console.log('Stream started', parsed.data);
              if (options.onStart) options.onStart();
              break;
              
            case StreamEventType.CONTENT:
              if (parsed.data) options.onContent(parsed.data);
              break;
              
            case StreamEventType.ERROR:
              console.error('Stream error event:', parsed.error);
              if (options.onError) options.onError(new Error(parsed.error || 'Unknown stream error'));
              break;
              
            case StreamEventType.DONE:
              console.log('Stream completed');
              if (options.onComplete) options.onComplete();
              eventSource.close();
              break;
              
            case StreamEventType.HEARTBEAT:
              console.debug('Stream heartbeat received');
              if (options.onHeartbeat) options.onHeartbeat();
              break;
              
            default:
              // Handle legacy format for backward compatibility
              const content = parsed.choices?.[0]?.delta?.content || 
                              parsed.choices?.[0]?.message?.content || 
                              parsed.content || '';
              if (content) options.onContent(content);
          }
        } else {
          // Handle legacy format for backward compatibility
          const content = parsed.choices?.[0]?.delta?.content || 
                          parsed.choices?.[0]?.message?.content || 
                          parsed.content || '';
          if (content) options.onContent(content);
        }
      } catch (e) {
        console.error('Error parsing SSE data:', e, 'Raw data:', event.data);
        try {
          // Try to handle raw content if JSON parsing fails
          if (typeof event.data === 'string' && event.data.trim() && event.data !== '[DONE]') {
            options.onContent(event.data);
          }
        } catch (innerError) {
          console.error('Error handling raw SSE content:', innerError);
        }
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      
      // Implement exponential backoff retry
      if (retryCount < retryLimit) {
        retryCount++;
        console.log(`Retrying connection (${retryCount}/${retryLimit}) in ${retryDelay}ms...`);
        
        eventSource.close();
        
        setTimeout(() => {
          console.log(`Attempting reconnection #${retryCount}...`);
          setupSSEConnection(url, options);
        }, retryDelay * retryCount);
      } else {
        console.error(`Max retry attempts (${retryLimit}) reached. Closing connection.`);
        if (options.onError) options.onError(new Error('EventSource connection error: max retries reached'));
        eventSource.close();
      }
    };
    
    return {
      eventSource,
      isConnected: true,
      error: null
    };
  } catch (error) {
    console.error('Error setting up SSE connection:', error);
    if (options.onError) options.onError(error instanceof Error ? error : new Error('Unknown error'));
    return {
      eventSource: null,
      isConnected: false,
      error: error instanceof Error ? error : new Error('Unknown error')
    };
  }
};

export const closeSSEConnection = (connection: SSEConnection): void => {
  if (connection.eventSource) {
    console.log('Closing SSE connection');
    connection.eventSource.close();
  }
};

export const cleanStreamContent = (chunk: string): { content: string } => {
  try {
    let dataStr = chunk;
    if (dataStr.startsWith('data: ')) {
      dataStr = dataStr.slice(6);
    }
    dataStr = dataStr.trim();
    
    if (dataStr === '[DONE]') {
      return { content: '' };
    }
    
    const parsed = JSON.parse(dataStr);
    
    // Handle structured stream events
    if (parsed.type === StreamEventType.CONTENT && parsed.data) {
      return { content: parsed.data };
    }
    
    // Handle legacy format for backward compatibility
    const content = parsed.choices?.[0]?.delta?.content || 
                   parsed.choices?.[0]?.message?.content || 
                   parsed.content || '';
    return { content };
  } catch (e) {
    console.debug('Chunk parse error (expected during streaming):', e);
    return { content: '' };
  }
};
