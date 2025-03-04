/**
 * Helper functions for processing OpenRouter streams in edge functions
 */

/**
 * Processes a raw stream line from OpenRouter to extract content
 * @param line The raw line from the stream response
 * @returns The extracted content or empty string
 */
export function processStreamLine(line: string): string {
  if (!line || !line.trim()) {
    return '';
  }
  
  try {
    // Handle data: prefix
    const dataPrefix = 'data: ';
    if (!line.startsWith(dataPrefix)) {
      return '';
    }
    
    const jsonStr = line.slice(dataPrefix.length).trim();
    
    // Handle the '[DONE]' message
    if (jsonStr === '[DONE]') {
      return '';
    }
    
    // Parse JSON data
    const parsed = JSON.parse(jsonStr);
    
    // Extract content from delta structure (streaming format)
    if (parsed.choices?.[0]?.delta?.content) {
      return parsed.choices[0].delta.content;
    }
    
    // Also handle non-streaming format as fallback
    if (parsed.choices?.[0]?.message?.content) {
      return parsed.choices[0].message.content;
    }
    
    return '';
  } catch (e) {
    console.error('Error processing stream line:', e, 'Line:', line);
    return ''; // Return empty string on error
  }
}

/**
 * Transform a raw SSE stream into processed chunks for the client
 */
export async function* transformStream(stream: ReadableStream): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastChunkTime = Date.now();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Split on double newlines which separate SSE events
      const events = buffer.split('\n\n');
      
      // Keep the last potentially incomplete event in the buffer
      buffer = events.pop() || '';
      
      for (const event of events) {
        // Process each line in the event
        const lines = event.split('\n');
        for (const line of lines) {
          const content = processStreamLine(line);
          if (content) {
            yield content;
            lastChunkTime = Date.now();
          }
        }
      }
      
      // If we've been holding data in the buffer for too long (500ms), 
      // try to process it even if it doesn't end with a newline
      if (buffer && Date.now() - lastChunkTime > 500) {
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const content = processStreamLine(line);
          if (content) {
            yield content;
            lastChunkTime = Date.now();
          }
        }
      }
    }
    
    // Process any remaining data in the buffer
    if (buffer) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        const content = processStreamLine(line);
        if (content) {
          yield content;
        }
      }
    }
    
  } finally {
    reader.releaseLock();
  }
}
