
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
    const jsonStr = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
    
    // Handle the '[DONE]' message
    if (jsonStr === '[DONE]') {
      return '';
    }
    
    // Parse JSON data
    const parsed = JSON.parse(jsonStr);
    
    // Extract content from delta/message structure
    if (parsed.choices?.[0]?.delta?.content) {
      return parsed.choices[0].delta.content;
    } else if (parsed.choices?.[0]?.message?.content) {
      return parsed.choices[0].message.content;
    }
    
    return '';
  } catch (e) {
    console.error('Error processing stream line:', e);
    return ''; // Return empty string on error
  }
}

/**
 * Transform a raw stream into processed chunks for the client
 * This implementation is intentionally simplified to maximize streaming performance
 */
export async function* transformStream(stream: ReadableStream): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      // Decode the current chunk
      const chunk = decoder.decode(value, { stream: true });
      
      // Split by event delimiters
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim() && line.includes('data:')) {
          const content = processStreamLine(line);
          if (content) {
            yield content;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
