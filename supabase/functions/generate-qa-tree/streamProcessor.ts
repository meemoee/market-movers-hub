
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
    // Handle data: prefix if present
    if (!line.startsWith('data:')) {
      return '';
    }
    
    const jsonStr = line.slice(5).trim();
    
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
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      // Decode and append to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer
      
      for (const line of lines) {
        // Process each complete line
        const content = processStreamLine(line);
        if (content) {
          yield content;
        }
      }
    }
    
    // Process any remaining data
    if (buffer) {
      const content = processStreamLine(buffer);
      if (content) {
        yield content;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
