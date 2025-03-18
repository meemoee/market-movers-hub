
export interface SSEConnection {
  eventSource: EventSource | null;
  isConnected: boolean;
  error: Error | null;
}

export const setupSSEConnection = (
  url: string,
  onMessage: (data: any) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): SSEConnection => {
  try {
    const eventSource = new EventSource(url);
    
    eventSource.onmessage = (event) => {
      try {
        if (event.data === '[DONE]') {
          if (onComplete) onComplete();
          eventSource.close();
          return;
        }
        
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch (e) {
        console.error('Error parsing SSE data:', e, 'Raw data:', event.data);
        if (onError) onError(new Error(`Error parsing SSE data: ${e.message}`));
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      if (onError) onError(new Error('EventSource connection error'));
      eventSource.close();
    };
    
    return {
      eventSource,
      isConnected: true,
      error: null
    };
  } catch (error) {
    console.error('Error setting up SSE connection:', error);
    if (onError) onError(error instanceof Error ? error : new Error('Unknown error'));
    return {
      eventSource: null,
      isConnected: false,
      error: error instanceof Error ? error : new Error('Unknown error')
    };
  }
};

export const closeSSEConnection = (connection: SSEConnection): void => {
  if (connection.eventSource) {
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
    const content = parsed.choices?.[0]?.delta?.content || 
                   parsed.choices?.[0]?.message?.content || '';
    return { content };
  } catch (e) {
    console.debug('Chunk parse error (expected during streaming):', e);
    return { content: '' };
  }
};
