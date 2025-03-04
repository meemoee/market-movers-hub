/**
 * Helper functions for processing OpenRouter streams in edge functions
 */

/**
 * Processes a raw stream line from OpenRouter to extract content
 * @param line The raw line from the stream response
 * @returns The extracted content or empty string
 */
export function processStreamLine(line: string): string {
  if (!line.trim() || line.includes('OPENROUTER PROCESSING')) {
    return '';
  }
  
  try {
    // Check if line starts with "data: " and extract the JSON part
    const jsonStr = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
    
    // Handle the '[DONE]' message
    if (jsonStr === '[DONE]') {
      return '';
    }
    
    // Try to parse the JSON
    const parsed = JSON.parse(jsonStr);
    
    // Extract content based on different possible structures
    if (parsed.choices?.[0]?.delta?.content) {
      return parsed.choices[0].delta.content;
    } else if (parsed.choices?.[0]?.message?.content) {
      return parsed.choices[0].message.content;
    } else {
      return '';
    }
  } catch (e) {
    // Don't swallow the original line on parse errors - it might be partial data that should be returned
    console.error('Error processing stream line:', e, 'Line:', line);
    
    // If we can't parse as JSON, but it contains content, return the raw line
    // This ensures partial chunks still get through
    if (line.includes('content')) {
      return line;
    }
    
    return '';
  }
}

/**
 * Transform a raw stream into processed chunks for the client
 * @param stream The raw response stream
 */
export async function* transformStream(stream: ReadableStream): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Process any remaining data in the buffer before finishing
        if (buffer.trim()) {
          const content = processStreamLine(buffer);
          if (content) yield content;
        }
        break;
      }
      
      // Decode the chunk and add to buffer
      const chunk = decoder.decode(value, { stream: true });
      
      // Split by newlines to handle multiple events in one chunk
      const lines = chunk.split('\n');
      
      // Process all complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = buffer + lines[i];
        buffer = '';
        
        if (line.trim()) {
          const content = processStreamLine(line);
          if (content) {
            // Immediately yield any content we get
            yield content;
          }
        }
      }
      
      // Keep the last (potentially incomplete) line in the buffer
      buffer += lines[lines.length - 1];
      
      // If the buffer contains a complete event (ends with newline), process it
      if (buffer.endsWith('\n')) {
        const line = buffer.trim();
        buffer = '';
        
        if (line) {
          const content = processStreamLine(line);
          if (content) yield content;
        }
      }
    }
  } catch (error) {
    console.error('Error in stream processing:', error);
    yield `Error: ${error.message}`;
  } finally {
    reader.releaseLock();
  }
}
