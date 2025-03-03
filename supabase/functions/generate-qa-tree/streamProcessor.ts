
// A simple utility class to process and transform streaming responses
export class StreamProcessor {
  private buffer: string = '';
  private decoder: TextDecoder;
  
  constructor() {
    this.decoder = new TextDecoder();
  }
  
  // Process a chunk of data from the stream
  processChunk(chunk: Uint8Array): string {
    const decoded = this.decoder.decode(chunk, { stream: true });
    this.buffer += decoded;
    
    // Check if we have complete JSON objects
    const lines = this.buffer.split('\n');
    const completeLines = lines.slice(0, -1);
    this.buffer = lines[lines.length - 1];
    
    // Process each complete line
    return completeLines
      .filter(line => line.trim() !== '')
      .map(line => {
        try {
          return this.parseLine(line);
        } catch (error) {
          console.error('Error parsing line:', error, line);
          return '';
        }
      })
      .join('');
  }
  
  // Handle final chunk and flush buffer
  finalize(chunk?: Uint8Array): string {
    if (chunk) {
      const decoded = this.decoder.decode(chunk);
      this.buffer += decoded;
    }
    
    // Process any remaining data in the buffer
    const remainingContent = this.buffer;
    this.buffer = '';
    
    if (remainingContent.trim() === '') {
      return '';
    }
    
    try {
      return this.parseLine(remainingContent);
    } catch (error) {
      console.error('Error parsing final chunk:', error);
      return remainingContent; // Return raw content if parsing fails
    }
  }
  
  // Parse an individual line from the stream
  private parseLine(line: string): string {
    // Handle CloudFlare-specific streaming format if present
    if (line.startsWith('data: ')) {
      line = line.slice(6);
    }
    
    // Handle empty or "[DONE]" messages
    if (line.trim() === '' || line.includes('[DONE]')) {
      return '';
    }
    
    try {
      const parsed = JSON.parse(line);
      
      // Handle different API response formats
      if (parsed.choices && parsed.choices[0]) {
        // OpenAI/OpenRouter format
        const content = parsed.choices[0].delta?.content || parsed.choices[0].text || '';
        return content;
      } else if (parsed.response) {
        // Alternative format
        return parsed.response;
      } else if (typeof parsed === 'string') {
        return parsed;
      }
    } catch (error) {
      // If JSON parsing fails, return the line as is
      return line;
    }
    
    return '';
  }
}
