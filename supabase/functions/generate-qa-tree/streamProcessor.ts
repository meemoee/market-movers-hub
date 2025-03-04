
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
    console.error('Error processing stream line:', e, 'Line:', line);
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
        if (buffer.trim()) {
          const content = processStreamLine(buffer);
          if (content) yield content;
        }
        break;
      }
      
      // Decode the chunk and add to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // Process complete lines in the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
      
      for (const line of lines) {
        if (line.trim()) {
          const content = processStreamLine(line);
          if (content) yield content;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
