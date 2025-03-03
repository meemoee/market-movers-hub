
export class StreamProcessor {
  private buffer: string = '';

  processChunk(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    const contents: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        
        // Skip [DONE] messages
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            contents.push(content);
          }
        } catch (e) {
          // Skip parsing errors which are common in streaming responses
          console.debug('Chunk parse error (expected during streaming):', e);
        }
      }
    }

    return contents;
  }
}
