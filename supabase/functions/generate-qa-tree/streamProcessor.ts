
/**
 * Ultra-simplified stream processor that directly forwards SSE events
 */

/**
 * Parses a single SSE line to extract content
 */
export function processStreamLine(line: string): string {
  if (!line || !line.startsWith('data: ')) {
    return '';
  }
  
  const data = line.slice(6).trim();
  
  // Skip [DONE] marker
  if (data === '[DONE]') {
    return '';
  }
  
  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content || 
           parsed.choices?.[0]?.message?.content || '';
  } catch (e) {
    console.error('Error parsing SSE line:', e);
    return '';
  }
}

/**
 * Transforms a ReadableStream of SSE events into a stream of content chunks
 */
export async function* streamContent(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Process any remaining data in buffer
        if (buffer.includes('data:')) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            const content = processStreamLine(line);
            if (content) yield content;
          }
        }
        break;
      }
      
      // Add new chunk to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE events (split by double newlines)
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      
      for (const part of parts) {
        if (!part.trim()) continue;
        
        const lines = part.split('\n');
        for (const line of lines) {
          const content = processStreamLine(line);
          if (content) yield content;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
